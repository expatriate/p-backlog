import { groupBy } from "../collections";
import { firstParentLanding } from "../git/landing";
import { commitHashOf, outputLine, PARSED_DIFF_OPTIONS, resolveCommits, resolveTrees, topLiteralPathspecs, type CommitHash, type GitRunner } from "../git/run";
import { remembered } from "../remembered";
import { firstLineOf, hunkHeaderOf, patchShapes, type BlobPair, type ChangeStart, type HunkHeader } from "./diff-hunks";

type FileVersion = { path: string; version: string };

type CommitChange = FileVersion & { commit: string };

type Fork = { base: CommitHash; tip: CommitHash; head: string };

type RepoGit = { repo: string; git: GitRunner };

type ForkView = Fork & RepoGit & { historyOptions: readonly string[] };

type Patch = { id: string; commit: string; preimageRevision: string; blobs: BlobPair | undefined; changeStarts: readonly ChangeStart[]; changedText: string };

type PatchPair = readonly [change: Patch, copy: Patch];

type LineSpan = { firstLine: number; lineCount: number };

type PreimageEdit = LineSpan & { delta: number };

type EditsBetween = (change: Patch, copy: Patch) => readonly PreimageEdit[] | null;

type PatchCopies = { squashed: string[]; commitByCommit: string[][]; editsComplete: boolean };

type PreimageEditsLookup = { editsBetween: EditsBetween; complete: boolean };

type CommitsCarryingContent = (tip: string, scope: readonly string[]) => Promise<string[]>;

// diff-tree ignores diff.algorithm and diff.indentHeuristic from git config; pinning them keeps patches and preimage diffs on one algorithm.
// patch-id hashes context lines, so the context is pinned rather than taken from diff.context; zero context lets a copy match beside a neighbour's edit, and atSamePlace rejects a copy when the preimages differ at its first changed line or, for an insertion, at either neighbour.
const PATCH_OPTIONS = ["-p", ...PARSED_DIFF_OPTIONS, "--no-renames", "--no-relative", "--full-index", "--diff-algorithm=myers", "--indent-heuristic", "--unified=0", "--inter-hunk-context=0"];
const COMMIT_HEADER = "--format=commit %H";
const INSERTION_NEIGHBOURS = 2;
const TREE_PAIR_LINE = /^[0-9a-f]+ [0-9a-f]+$/;
const NO_COMMIT = /^0+$/;
const COMMIT_RECORD = /commit (?<commit>[0-9a-f]+)\0/;
// --raw -z file record: ":100644 100644 <old blob> <new blob> M\0<path>\0"
const FILE_RECORD = /:\d+ (?<mode>\d+) [0-9a-f]+ (?<object>[0-9a-f]+) [A-Z]\d*\0(?<path>[^\0]*)\0/;
const RAW_RECORD = new RegExp(`${COMMIT_RECORD.source}|${FILE_RECORD.source}`, "g");

export type LandingState = "landed" | "pending" | "unknown";

export async function landingState(repo: string, tip: CommitHash, git: GitRunner): Promise<LandingState> {
  const fork = await forkAt(repo, "HEAD", tip, git);
  if (fork === null) return "unknown";
  const view: ForkView = { ...fork, repo, historyOptions: [], git };
  const changed = await branchChanges(view, []);
  if (changed === null) return "unknown";
  if (changed.length === 0) return "landed";
  const landed = await headChanges(view, topLiteralPathspecs(changed.map(({ path }) => path)));
  if (landed === null) return "unknown";
  const landedVersions = new Set(landed.map(({ version }) => version));
  let state: LandingState = "landed";
  for (const { path, version } of changed) {
    const pathState = landedVersions.has(version) ? "landed" : await changeLanded(view, path);
    if (pathState === "pending") return "pending";
    if (pathState === "unknown") state = "unknown";
  }
  return state;
}

export function commitsCarryingContent(repo: string, git: GitRunner, historyOptions: readonly string[]): CommitsCarryingContent {
  const forks = new Map<string, Promise<Fork | null>>();
  return async (tip, scope) => {
    const fork = await remembered(forks, tip, () => forkBeforeLanding(repo, tip, git));
    return fork === null ? [] : commitsCarrying({ ...fork, repo, historyOptions, git }, scope);
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

async function forkAt(repo: string, head: string, tip: CommitHash, git: GitRunner): Promise<Fork | null> {
  const base = commitHashOf(outputLine(await git(repo, ["merge-base", head, tip])));
  return base === null ? null : { base, tip, head };
}

async function forkBeforeLanding(repo: string, revision: string, git: GitRunner): Promise<Fork | null> {
  const tip = (await resolveCommits(git, repo, [revision]))?.get(revision);
  if (tip === undefined) return null;
  const fork = await forkAt(repo, "HEAD", tip, git);
  if (fork === null || !tipInHead(fork)) return fork;
  const landing = await firstParentLanding(git, repo, tip, "HEAD");
  return landing === null ? fork : forkAt(repo, landing.firstParent, tip, git);
}

function tipInHead({ base, tip }: Fork): boolean {
  return base === tip;
}

async function branchChanges(view: ForkView, pathspecs: readonly string[]): Promise<FileVersion[] | null> {
  const { repo, base, tip, git } = view;
  if (tipInHead(view)) return [];
  const changed = await git(repo, ["diff-tree", "-r", "-z", "--no-renames", base, tip, "--", ...pathspecs]);
  return changed === null ? null : rawChanges(changed);
}

async function headChanges({ repo, base, head, historyOptions, git }: ForkView, pathspecs: readonly string[]): Promise<CommitChange[] | null> {
  const rawLog = await git(repo, ["log", "--stdin", COMMIT_HEADER, "--raw", "-z", "--no-renames", "--no-abbrev", "--no-relative", ...historyOptions], `${base}..${head}\n--\n${pathspecs.join("\n")}\n`);
  return rawLog === null ? null : rawChanges(rawLog);
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

async function changeLanded(view: ForkView, path: string): Promise<LandingState> {
  const copies = await patchCopies(view, path);
  if (copies === null) return "unknown";
  if (copies.squashed.length > 0 || everyCommitCopied(copies)) return "landed";
  return copies.editsComplete ? "pending" : "unknown";
}

function everyCommitCopied({ commitByCommit }: PatchCopies): boolean {
  return commitByCommit.length > 0 && commitByCommit.every((commitCopies) => commitCopies.length > 0);
}

function earliestCopies(copies: PatchCopies): string[] {
  const earliest = (newestFirst: readonly string[]) => newestFirst.slice(-1);
  return [earliest(copies.squashed), ...(everyCommitCopied(copies) ? copies.commitByCommit.map(earliest) : [])].flat();
}

async function patchCopies(view: ForkView, path: string): Promise<PatchCopies | null> {
  const { repo, base, tip, head, historyOptions, git } = view;
  const onlyPath = ["--", ...topLiteralPathspecs([path])];
  const [squashedPatch, branchPatches, headPatches] = await Promise.all([
    patchesOf(repo, ["diff", ...PATCH_OPTIONS, base, tip, ...onlyPath], () => base, git),
    patchesOf(repo, ["log", ...PATCH_OPTIONS, COMMIT_HEADER, `${base}..${tip}`, ...onlyPath], parentOf, git),
    patchesOf(repo, ["log", ...PATCH_OPTIONS, COMMIT_HEADER, "--date-order", ...historyOptions, `${base}..${head}`, ...onlyPath], parentOf, git),
  ]);
  if (squashedPatch === null || branchPatches === null || headPatches === null) return null;
  const headPatchesById = groupBy(headPatches, ({ id }) => id);
  const sameChanges = (change: Patch) => (headPatchesById.get(change.id) ?? []).filter((copy) => isSameChange(change, copy));
  const pairs = [...squashedPatch, ...branchPatches].flatMap((change) => sameChanges(change).map((copy): PatchPair => [change, copy]));
  const { editsBetween, complete } = await preimageEdits(view, path, pairs);
  const copiesOf = (change: Patch) => sameChanges(change).flatMap((copy) => (atSamePlace(change, copy, editsBetween) ? [copy.commit] : []));
  return { squashed: squashedPatch.flatMap(copiesOf), commitByCommit: branchPatches.map(copiesOf), editsComplete: complete };
}

async function patchesOf(repo: string, patchArgs: string[], preimageOf: (commit: string) => string, git: GitRunner): Promise<Patch[] | null> {
  const patches = await git(repo, patchArgs);
  if (patches === null) return null;
  const ids = await git(repo, ["patch-id", "--stable"], patches);
  if (ids === null) return null;
  const shapeOf = patchShapes(patches);
  return ids
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const [id = "", label = ""] = line.split(" ");
      const commit = NO_COMMIT.test(label) ? "" : label;
      return { id, commit, preimageRevision: preimageOf(commit), ...shapeOf(commit) };
    });
}

async function preimageEdits(repoGit: RepoGit, path: string, pairs: readonly PatchPair[]): Promise<PreimageEditsLookup> {
  const comparedPairs = pairs.filter(([change, copy]) => editsNeeded(change, copy));
  const trees = await resolveTrees(repoGit.git, repoGit.repo, [...new Set(comparedPairs.flatMap(([change, copy]) => [change.preimageRevision, copy.preimageRevision]))]);
  const treePairOf = (change: Patch, copy: Patch) => {
    const from = trees?.get(change.preimageRevision);
    const to = trees?.get(copy.preimageRevision);
    return from === undefined || to === undefined ? null : `${from} ${to}`;
  };
  const editsByTreePair = await treeDiffEdits(repoGit, path, [...new Set(comparedPairs.flatMap(([change, copy]) => treePairOf(change, copy) ?? []))]);
  const editsBetween: EditsBetween = (change, copy) => {
    if (!editsNeeded(change, copy)) return [];
    const treePair = treePairOf(change, copy);
    return treePair === null ? null : (editsByTreePair?.get(treePair) ?? null);
  };
  return { editsBetween, complete: trees !== null && editsByTreePair !== null };
}

async function treeDiffEdits({ repo, git }: RepoGit, path: string, treePairs: readonly string[]): Promise<Map<string, PreimageEdit[]> | null> {
  if (treePairs.length === 0) return new Map();
  const preimageDiffs = await git(repo, ["diff-tree", "--stdin", ...PATCH_OPTIONS, "--", ...topLiteralPathspecs([path])], treePairs.map((treePair) => `${treePair}\n`).join(""));
  return preimageDiffs === null ? null : preimageEditsByTreePair(preimageDiffs);
}

function preimageEditsByTreePair(preimageDiffs: string): Map<string, PreimageEdit[]> {
  const editsByTreePair = new Map<string, PreimageEdit[]>();
  let edits: PreimageEdit[] = [];
  for (const line of preimageDiffs.split("\n")) {
    if (TREE_PAIR_LINE.test(line)) {
      edits = [];
      editsByTreePair.set(line, edits);
    } else edits.push(...preimageEditsOf(hunkHeaderOf(line)));
  }
  return editsByTreePair;
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

function editsNeeded(change: Patch, copy: Patch): boolean {
  return change.changeStarts.length > 0 && !samePreimage(change, copy);
}

function atSamePlace(change: Patch, copy: Patch, editsBetween: EditsBetween): boolean {
  const edits = editsBetween(change, copy);
  return edits !== null && change.changeStarts.every((start, index) => copyStartsAtSamePlace(start, copy.changeStarts[index], edits));
}

function copyStartsAtSamePlace(start: ChangeStart, copyStart: ChangeStart | undefined, edits: readonly PreimageEdit[]): boolean {
  const place = placeOf(start);
  const placeUntouched = !edits.some((edit) => spansOverlap(edit, place));
  return placeUntouched && shiftedLine(start.line, edits) === copyStart?.line;
}

function placeOf({ line, insertion }: ChangeStart): LineSpan {
  return insertion ? { firstLine: line - 1, lineCount: INSERTION_NEIGHBOURS } : { firstLine: line, lineCount: 1 };
}

function spansOverlap(edit: LineSpan, place: LineSpan): boolean {
  return edit.firstLine < lineAfter(place) && place.firstLine < lineAfter(edit);
}

function lineAfter({ firstLine, lineCount }: LineSpan): number {
  return firstLine + lineCount;
}

function preimageEditsOf(header: HunkHeader | null): PreimageEdit[] {
  if (header === null) return [];
  return [{ firstLine: firstLineOf(header.oldStart, header.oldCount), lineCount: header.oldCount, delta: header.newCount - header.oldCount }];
}

function shiftedLine(line: number, edits: readonly PreimageEdit[]): number {
  return edits.reduce((shifted, edit) => (lineAfter(edit) <= line ? shifted + edit.delta : shifted), line);
}

function parentOf(commit: string): string {
  return `${commit}^`;
}

function fileVersion({ mode = "", object = "", path = "" }: Record<string, string | undefined> = {}): FileVersion {
  return { path, version: `${mode} ${object}\0${path}` };
}
