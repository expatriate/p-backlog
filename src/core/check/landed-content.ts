import { groupBy } from "../collections";
import { outputLine, resolveTrees, type GitRunner } from "../git/run";
import { remembered } from "../remembered";
import { FILE_HEADER, firstLineOf, hunkHeaderOf, type HunkHeader } from "./diff-hunks";

type FileVersion = { path: string; version: string };

type CommitChange = FileVersion & { commit: string };

type Fork = { base: string; tip: string; head: string };

type HeadHistory = "simplified" | "full";

type RepoGit = { repo: string; git: GitRunner };

type ForkView = Fork & RepoGit & { history: HeadHistory };

type BlobPair = { preimage: string; postimage: string };

type PatchShape = { blobs: BlobPair | undefined; changeStarts: number[]; changedText: string };

type Patch = { id: string; commit: string; preimageRevision: string; blobs: BlobPair | undefined; changeStarts: readonly number[]; changedText: string };

type PatchPair = readonly [change: Patch, copy: Patch];

type HunkWalk = { oldLine: number; changing: boolean };

type LineShift = { shiftsLinesAfter: number; delta: number };

type ShiftsBetween = (change: Patch, copy: Patch) => readonly LineShift[] | null;

type PatchCopies = { squashed: string[]; commitByCommit: string[][] };

type CommitsCarryingContent = (tip: string, scope: readonly string[]) => Promise<string[]>;

// diff-tree ignores diff.algorithm and diff.indentHeuristic from git config; pinning them keeps patches and preimage diffs on one algorithm.
const PATCH_OPTIONS = ["-p", "--no-color", "--no-ext-diff", "--no-textconv", "--no-renames", "--no-relative", "--full-index", "--diff-algorithm=myers", "--indent-heuristic"];
const COMMIT_HEADER = "--format=commit %H";
const COMMIT_LINE = /^commit (?<commit>[0-9a-f]+)$/;
const INDEX_LINE = /^index (?<preimage>[0-9a-f]+)\.\.(?<postimage>[0-9a-f]+)/;
const TREE_PAIR_LINE = /^[0-9a-f]+ [0-9a-f]+$/;
const NO_COMMIT = /^0+$/;
const NO_NEWLINE_MARK = "\\";
const RAW_RECORD = /commit (?<commit>[0-9a-f]+)\0|:\d+ (?<mode>\d+) [0-9a-f]+ (?<object>[0-9a-f]+) [A-Z]\d*\0(?<path>[^\0]*)\0/g;

export async function contentLanded(repo: string, tip: string, git: GitRunner): Promise<boolean> {
  const fork = await forkAt(repo, "HEAD", tip, git);
  if (fork === null) return false;
  const view: ForkView = { ...fork, repo, history: "simplified", git };
  const changed = await branchChanges(view, []);
  if (changed === null) return false;
  if (changed.length === 0) return true;
  const pathspecs = changed.map(({ path }) => pathspecOf(path));
  const landed = await headChanges(view, pathspecs);
  if (landed === null) return false;
  const landedVersions = new Set(landed.map(({ version }) => version));
  for (const { path, version } of changed) {
    if (!landedVersions.has(version) && !(await changeLanded(view, path))) return false;
  }
  return true;
}

export function commitsCarryingContent(repo: string, git: GitRunner): CommitsCarryingContent {
  const forks = new Map<string, Promise<Fork | null>>();
  return async (tip, scope) => {
    const fork = await remembered(forks, tip, () => forkBeforeLanding(repo, tip, git));
    // The commits judged here are the ones repo-facts lists, and it reads history with --full-history.
    return fork === null ? [] : commitsCarrying({ ...fork, repo, history: "full", git }, scope);
  };
}

async function commitsCarrying(view: ForkView, scope: readonly string[]): Promise<string[]> {
  const changed = await branchChanges(view, scope);
  if (changed === null || changed.length === 0) return [];
  const head = await headChanges(view, scope);
  if (head === null) return [];
  const tipVersions = new Set(changed.map(({ version }) => version));
  const branchPaths = new Set(changed.map(({ path }) => path));
  const copiesByPath = new Map<string, Promise<ReadonlySet<string>>>();
  const patchCopiesOf = (path: string) =>
    remembered(copiesByPath, path, async () => {
      const copies = await patchCopies(view, path);
      return new Set(copies === null ? [] : earliestCopies(copies));
    });
  const carriesTip = async ({ commit, path, version }: CommitChange) => tipVersions.has(version) || (branchPaths.has(path) && (await patchCopiesOf(path)).has(commit));
  const carriesOnlyTip = async (changes: readonly CommitChange[]) => (await Promise.all(changes.map(carriesTip))).every(Boolean);
  const carrying = await Promise.all([...groupBy(head, ({ commit }) => commit)].map(async ([commit, changes]) => ((await carriesOnlyTip(changes)) ? [commit] : [])));
  return carrying.flat();
}

async function forkAt(repo: string, head: string, tip: string, git: GitRunner): Promise<Fork | null> {
  const base = outputLine(await git(repo, ["merge-base", head, tip]));
  return base === null ? null : { base, tip, head };
}

async function forkBeforeLanding(repo: string, tip: string, git: GitRunner): Promise<Fork | null> {
  const fork = await forkAt(repo, "HEAD", tip, git);
  if (fork === null || !tipInHead(fork)) return fork;
  const beforeLanding = await firstParentBeforeLanding(repo, tip, git);
  return beforeLanding === null ? fork : forkAt(repo, beforeLanding, tip, git);
}

async function firstParentBeforeLanding(repo: string, tip: string, git: GitRunner): Promise<string | null> {
  const chain = (await git(repo, ["rev-list", "--first-parent", `${tip}..HEAD`]))?.split("\n").filter((sha) => sha !== "") ?? [];
  const chainCarriesTip = async (index: number) => (await git(repo, ["merge-base", "--is-ancestor", tip, chain[index] ?? ""])) !== null;
  if (chain.length === 0 || (await chainCarriesTip(chain.length - 1))) return null;
  let carrying = 0;
  let notCarrying = chain.length - 1;
  while (notCarrying - carrying > 1) {
    const middle = Math.floor((carrying + notCarrying) / 2);
    if (await chainCarriesTip(middle)) carrying = middle;
    else notCarrying = middle;
  }
  return chain[notCarrying] ?? null;
}

function tipInHead({ base, tip }: Fork): boolean {
  return base.startsWith(tip);
}

async function branchChanges(view: ForkView, pathspecs: readonly string[]): Promise<FileVersion[] | null> {
  const { repo, base, tip, git } = view;
  if (tipInHead(view)) return [];
  const changed = await git(repo, ["diff-tree", "-r", "-z", "--no-renames", base, tip, "--", ...pathspecs]);
  return changed === null ? null : rawChanges(changed);
}

async function headChanges({ repo, base, head, history, git }: ForkView, pathspecs: readonly string[]): Promise<CommitChange[] | null> {
  const rawLog = await git(repo, ["log", "--stdin", COMMIT_HEADER, "--raw", "-z", "--no-renames", "--no-abbrev", "--no-relative", ...historyOptions(history)], `${base}..${head}\n--\n${pathspecs.join("\n")}\n`);
  return rawLog === null ? null : rawChanges(rawLog);
}

function historyOptions(history: HeadHistory): string[] {
  return history === "full" ? ["--full-history"] : [];
}

function rawChanges(raw: string): CommitChange[] {
  const changes: CommitChange[] = [];
  let commit = "";
  for (const { groups } of raw.matchAll(RAW_RECORD)) {
    if (groups?.commit === undefined) changes.push({ commit, ...fileVersion(groups) });
    else commit = groups.commit;
  }
  return changes;
}

async function changeLanded(view: ForkView, path: string): Promise<boolean> {
  const copies = await patchCopies(view, path);
  return copies !== null && (copies.squashed.length > 0 || everyCommitCopied(copies));
}

function everyCommitCopied({ commitByCommit }: PatchCopies): boolean {
  return commitByCommit.length > 0 && commitByCommit.every((commitCopies) => commitCopies.length > 0);
}

function earliestCopies(copies: PatchCopies): string[] {
  const earliest = (newestFirst: readonly string[]) => newestFirst.slice(-1);
  return [earliest(copies.squashed), ...(everyCommitCopied(copies) ? copies.commitByCommit.map(earliest) : [])].flat();
}

async function patchCopies(view: ForkView, path: string): Promise<PatchCopies | null> {
  const { repo, base, tip, head, history, git } = view;
  const onlyPath = ["--", pathspecOf(path)];
  const [squashedPatch, branchPatches, headPatches] = await Promise.all([
    patchesOf(repo, ["diff", ...PATCH_OPTIONS, base, tip, ...onlyPath], () => base, git),
    patchesOf(repo, ["log", ...PATCH_OPTIONS, COMMIT_HEADER, `${base}..${tip}`, ...onlyPath], parentOf, git),
    patchesOf(repo, ["log", ...PATCH_OPTIONS, COMMIT_HEADER, "--date-order", ...historyOptions(history), `${base}..${head}`, ...onlyPath], parentOf, git),
  ]);
  if (squashedPatch === null || branchPatches === null || headPatches === null) return null;
  const headPatchesById = groupBy(headPatches, ({ id }) => id);
  const sameChanges = (change: Patch) => (headPatchesById.get(change.id) ?? []).filter((copy) => isSameChange(change, copy));
  const pairs = [...squashedPatch, ...branchPatches].flatMap((change) => sameChanges(change).map((copy): PatchPair => [change, copy]));
  const shiftsBetween = await preimageShifts(view, path, pairs);
  const copiesOf = (change: Patch) => sameChanges(change).flatMap((copy) => (atSamePlace(change, copy, shiftsBetween) ? [copy.commit] : []));
  return { squashed: squashedPatch.flatMap(copiesOf), commitByCommit: branchPatches.map(copiesOf) };
}

async function patchesOf(repo: string, patchArgs: string[], preimageOf: (commit: string) => string, git: GitRunner): Promise<Patch[] | null> {
  const patches = await git(repo, patchArgs);
  if (patches === null) return null;
  const ids = await git(repo, ["patch-id", "--stable"], patches);
  if (ids === null) return null;
  const shapes = patchShapesByCommit(patches);
  return ids
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const [id = "", label = ""] = line.split(" ");
      const commit = NO_COMMIT.test(label) ? "" : label;
      const { blobs, changeStarts, changedText } = shapes.get(commit) ?? emptyShape();
      return { id, commit, preimageRevision: preimageOf(commit), blobs, changeStarts, changedText };
    });
}

function patchShapesByCommit(patches: string): Map<string, PatchShape> {
  const shapes = new Map<string, PatchShape>();
  let shape = emptyShape();
  shapes.set("", shape);
  let hunk: HunkWalk | undefined;
  for (const line of patches.split("\n")) {
    const commit = COMMIT_LINE.exec(line)?.groups?.commit;
    const header = hunkHeaderOf(line);
    if (commit !== undefined) {
      shape = emptyShape();
      shapes.set(commit, shape);
      hunk = undefined;
    } else if (line.startsWith(FILE_HEADER)) hunk = undefined;
    else if (header !== null) hunk = { oldLine: firstLineOf(header.oldStart, header.oldCount), changing: false };
    else if (hunk === undefined) shape.blobs ??= blobPairOf(line);
    else walkHunkLine(hunk, line, shape);
  }
  return shapes;
}

function blobPairOf(line: string): BlobPair | undefined {
  const blobs = INDEX_LINE.exec(line)?.groups;
  return blobs === undefined ? undefined : { preimage: blobs.preimage ?? "", postimage: blobs.postimage ?? "" };
}

function walkHunkLine(hunk: HunkWalk, line: string, shape: PatchShape): void {
  const mark = line.charAt(0);
  if (mark === NO_NEWLINE_MARK) return;
  const changed = mark === "-" || mark === "+";
  if (changed && !hunk.changing) shape.changeStarts.push(hunk.oldLine);
  if (changed) shape.changedText += `${line}\n`;
  hunk.changing = changed;
  if (mark !== "+") hunk.oldLine += 1;
}

function emptyShape(): PatchShape {
  return { blobs: undefined, changeStarts: [], changedText: "" };
}

async function preimageShifts(repoGit: RepoGit, path: string, pairs: readonly PatchPair[]): Promise<ShiftsBetween> {
  const shifted = pairs.filter(([change, copy]) => shiftsNeeded(change, copy));
  const trees = await resolveTrees(repoGit.git, repoGit.repo, [...new Set(shifted.flatMap(([change, copy]) => [change.preimageRevision, copy.preimageRevision]))]);
  const treePairOf = (change: Patch, copy: Patch) => {
    const from = trees?.get(change.preimageRevision);
    const to = trees?.get(copy.preimageRevision);
    return from === undefined || to === undefined ? null : `${from} ${to}`;
  };
  const shiftsByTreePair = await treeDiffShifts(repoGit, path, [...new Set(shifted.flatMap(([change, copy]) => treePairOf(change, copy) ?? []))]);
  return (change, copy) => {
    if (!shiftsNeeded(change, copy)) return [];
    const treePair = treePairOf(change, copy);
    return treePair === null ? null : (shiftsByTreePair.get(treePair) ?? null);
  };
}

async function treeDiffShifts({ repo, git }: RepoGit, path: string, treePairs: readonly string[]): Promise<Map<string, LineShift[]>> {
  if (treePairs.length === 0) return new Map();
  const preimageDiffs = await git(repo, ["diff-tree", "--stdin", ...PATCH_OPTIONS, "--unified=0", "--inter-hunk-context=0", "--", pathspecOf(path)], treePairs.map((treePair) => `${treePair}\n`).join(""));
  return preimageDiffs === null ? new Map() : lineShiftsByTreePair(preimageDiffs);
}

function lineShiftsByTreePair(preimageDiffs: string): Map<string, LineShift[]> {
  const shiftsByTreePair = new Map<string, LineShift[]>();
  let shifts: LineShift[] = [];
  for (const line of preimageDiffs.split("\n")) {
    if (TREE_PAIR_LINE.test(line)) {
      shifts = [];
      shiftsByTreePair.set(line, shifts);
    } else shifts.push(...lineShiftsOf(hunkHeaderOf(line)));
  }
  return shiftsByTreePair;
}

function isSameChange(change: Patch, copy: Patch): boolean {
  // git patch-id before 2.39 hashes none of a binary diff's content.
  const changeShownByHunks = change.changeStarts.length > 0;
  return copy.id === change.id && copy.changedText === change.changedText && copy.changeStarts.length === change.changeStarts.length && (changeShownByHunks || sameBlobs(change.blobs, copy.blobs));
}

function sameBlobs(change: BlobPair | undefined, copy: BlobPair | undefined): boolean {
  return change?.preimage === copy?.preimage && change?.postimage === copy?.postimage;
}

function samePreimage(change: Patch, copy: Patch): boolean {
  return change.blobs !== undefined && change.blobs.preimage === copy.blobs?.preimage;
}

function shiftsNeeded(change: Patch, copy: Patch): boolean {
  return change.changeStarts.length > 0 && !samePreimage(change, copy);
}

function atSamePlace(change: Patch, copy: Patch, shiftsBetween: ShiftsBetween): boolean {
  const shifts = shiftsBetween(change, copy);
  return shifts !== null && change.changeStarts.every((start, index) => shiftedLine(start, shifts) === copy.changeStarts[index]);
}

function lineShiftsOf(header: HunkHeader | null): LineShift[] {
  return header === null ? [] : [{ shiftsLinesAfter: firstLineOf(header.oldStart, header.oldCount) + header.oldCount - 1, delta: header.newCount - header.oldCount }];
}

function shiftedLine(line: number, shifts: readonly LineShift[]): number {
  return shifts.reduce((shifted, { shiftsLinesAfter, delta }) => (shiftsLinesAfter < line ? shifted + delta : shifted), line);
}

function parentOf(commit: string): string {
  return `${commit}^`;
}

function pathspecOf(path: string): string {
  return `:(top,literal)${path}`;
}

function fileVersion({ mode = "", object = "", path = "" }: Record<string, string | undefined> = {}): FileVersion {
  return { path, version: `${mode} ${object}\0${path}` };
}
