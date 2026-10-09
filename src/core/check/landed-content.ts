import { groupBy } from "../collections";
import { outputLine, type GitRunner } from "../git/run";
import { remembered } from "../remembered";
import { FILE_HEADER, firstLineOf, hunkHeaderOf, type HunkHeader } from "./diff-hunks";

type FileVersion = { path: string; version: string };

type CommitChange = FileVersion & { commit: string };

type Fork = { base: string; tip: string };

type BranchChanges = { fork: Fork; changed: FileVersion[] };

type HeadHistory = "simplified" | "full";

type PatchShape = { preimageBlob: string | undefined; changeStarts: number[]; changedText: string };

type Patch = { id: string; commit: string; preimage: string; preimageKey: string; changeStarts: readonly number[]; changedText: string };

type HunkWalk = { oldLine: number; changing: boolean };

type LineShift = { shiftsLinesAfter: number; delta: number };

type ShiftsBetween = (change: Patch, copy: Patch) => Promise<readonly LineShift[] | null>;

type PatchCopies = { squashed: string[]; commitByCommit: string[][] };

const PATCH_OPTIONS = ["-p", "--no-color", "--no-ext-diff", "--no-textconv", "--no-renames", "--no-relative", "--full-index"];
const COMMIT_HEADER = "--format=commit %H";
const COMMIT_LINE = /^commit (?<commit>[0-9a-f]+)$/;
const INDEX_LINE = /^index (?<preimage>[0-9a-f]+)\.\./;
const NO_COMMIT = /^0+$/;
const NO_NEWLINE_MARK = "\\";
const RAW_RECORD = /commit (?<commit>[0-9a-f]+)\0|:\d+ (?<mode>\d+) [0-9a-f]+ (?<object>[0-9a-f]+) [A-Z]\d*\0(?<path>[^\0]*)\0/g;

export async function contentLanded(repo: string, tip: string, git: GitRunner): Promise<boolean> {
  const branch = await branchChanges(repo, tip, [], git);
  if (branch === null) return false;
  if (branch.changed.length === 0) return true;
  const pathspecs = branch.changed.map(({ path }) => pathspecOf(path));
  const landed = await headChanges(repo, branch.fork, pathspecs, "simplified", git);
  if (landed === null) return false;
  const landedVersions = new Set(landed.map(({ version }) => version));
  for (const { path, version } of branch.changed) {
    if (!landedVersions.has(version) && !(await changeLanded(repo, branch.fork, path, git))) return false;
  }
  return true;
}

export async function commitsCarryingContent(repo: string, tip: string, scope: readonly string[], git: GitRunner): Promise<string[]> {
  const branch = await branchChanges(repo, tip, scope, git);
  if (branch === null || branch.changed.length === 0) return [];
  // The commits judged here are the ones repo-facts lists, and it reads history with --full-history.
  const head = await headChanges(repo, branch.fork, scope, "full", git);
  if (head === null) return [];
  const tipVersions = new Set(branch.changed.map(({ version }) => version));
  const branchPaths = new Set(branch.changed.map(({ path }) => path));
  const copiesByPath = new Map<string, Promise<ReadonlySet<string>>>();
  const patchCopiesOf = (path: string) =>
    remembered(copiesByPath, path, async () => {
      const copies = await patchCopies(repo, branch.fork, path, git);
      return new Set(copies === null ? [] : earliestCopies(copies));
    });
  const carriesTip = async ({ commit, path, version }: CommitChange) => tipVersions.has(version) || (branchPaths.has(path) && (await patchCopiesOf(path)).has(commit));
  const carriesOnlyTip = async (changes: readonly CommitChange[]) => (await Promise.all(changes.map(carriesTip))).every(Boolean);
  const carrying = await Promise.all([...groupBy(head, ({ commit }) => commit)].map(async ([commit, changes]) => ((await carriesOnlyTip(changes)) ? [commit] : [])));
  return carrying.flat();
}

async function branchChanges(repo: string, tip: string, scope: readonly string[], git: GitRunner): Promise<BranchChanges | null> {
  const base = outputLine(await git(repo, ["merge-base", "HEAD", tip]));
  if (base === null) return null;
  const fork = { base, tip };
  const tipInHead = base.startsWith(tip);
  if (tipInHead) return { fork, changed: [] };
  const changed = await git(repo, ["diff-tree", "-r", "-z", "--no-renames", base, tip, "--", ...scope]);
  return changed === null ? null : { fork, changed: rawChanges(changed) };
}

async function headChanges(repo: string, { base }: Fork, pathspecs: readonly string[], history: HeadHistory, git: GitRunner): Promise<CommitChange[] | null> {
  const historyOptions = history === "full" ? ["--full-history"] : [];
  const rawLog = await git(repo, ["log", "--stdin", COMMIT_HEADER, "--raw", "-z", "--no-renames", "--no-abbrev", "--no-relative", ...historyOptions], `${base}..HEAD\n--\n${pathspecs.join("\n")}\n`);
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

async function changeLanded(repo: string, fork: Fork, path: string, git: GitRunner): Promise<boolean> {
  const copies = await patchCopies(repo, fork, path, git);
  return copies !== null && (copies.squashed.length > 0 || everyCommitCopied(copies));
}

function everyCommitCopied({ commitByCommit }: PatchCopies): boolean {
  return commitByCommit.length > 0 && commitByCommit.every((commitCopies) => commitCopies.length > 0);
}

function earliestCopies(copies: PatchCopies): string[] {
  const earliest = (newestFirst: readonly string[]) => newestFirst.slice(-1);
  return [earliest(copies.squashed), ...(everyCommitCopied(copies) ? copies.commitByCommit.map(earliest) : [])].flat();
}

async function patchCopies(repo: string, { base, tip }: Fork, path: string, git: GitRunner): Promise<PatchCopies | null> {
  const onlyPath = ["--", pathspecOf(path)];
  const [squashedPatch, branchPatches, headPatches] = await Promise.all([
    patchesOf(repo, ["diff", ...PATCH_OPTIONS, base, tip, ...onlyPath], () => base, git),
    patchesOf(repo, ["log", ...PATCH_OPTIONS, COMMIT_HEADER, `${base}..${tip}`, ...onlyPath], parentOf, git),
    patchesOf(repo, ["log", ...PATCH_OPTIONS, COMMIT_HEADER, "--date-order", `${base}..HEAD`, ...onlyPath], parentOf, git),
  ]);
  if (squashedPatch === null || branchPatches === null || headPatches === null) return null;
  const shiftsBetween = shiftsBetweenPreimages(repo, path, git);
  const copiesOf = async (change: Patch) => {
    const sameChange = headPatches.filter(({ id, changedText }) => id === change.id && changedText === change.changedText);
    const copiesAtSamePlace = await Promise.all(sameChange.map(async (copy) => ((await atSamePlace(change, copy, shiftsBetween)) ? [copy.commit] : [])));
    return copiesAtSamePlace.flat();
  };
  const [squashed, commitByCommit] = await Promise.all([Promise.all(squashedPatch.map(copiesOf)), Promise.all(branchPatches.map(copiesOf))]);
  return { squashed: squashed.flat(), commitByCommit };
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
      const preimage = preimageOf(commit);
      const { preimageBlob, changeStarts, changedText } = shapes.get(commit) ?? emptyShape();
      return { id, commit, preimage, preimageKey: preimageBlob ?? preimage, changeStarts, changedText };
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
    else if (hunk === undefined) shape.preimageBlob ??= INDEX_LINE.exec(line)?.groups?.preimage;
    else walkHunkLine(hunk, line, shape);
  }
  return shapes;
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
  return { preimageBlob: undefined, changeStarts: [], changedText: "" };
}

function shiftsBetweenPreimages(repo: string, path: string, git: GitRunner): ShiftsBetween {
  const shiftsByPreimages = new Map<string, Promise<LineShift[] | null>>();
  return (change, copy) =>
    change.preimageKey === copy.preimageKey
      ? Promise.resolve([])
      : remembered(shiftsByPreimages, `${change.preimageKey} ${copy.preimageKey}`, async () => {
          const preimageDiff = await git(repo, ["diff", ...PATCH_OPTIONS, "--unified=0", "--inter-hunk-context=0", change.preimage, copy.preimage, "--", pathspecOf(path)]);
          return preimageDiff === null ? null : preimageDiff.split("\n").flatMap((line) => lineShiftsOf(hunkHeaderOf(line)));
        });
}

async function atSamePlace(change: Patch, copy: Patch, shiftsBetween: ShiftsBetween): Promise<boolean> {
  if (change.changeStarts.length !== copy.changeStarts.length) return false;
  const shifts = await shiftsBetween(change, copy);
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
