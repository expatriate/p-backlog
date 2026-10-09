import { groupBy } from "../collections";
import { outputLine, type GitRunner } from "../git/run";
import { remembered } from "../remembered";

type FileVersion = { path: string; version: string };

type CommitChange = FileVersion & { commit: string };

type Fork = { base: string; tip: string };

type BranchChanges = { fork: Fork; changed: FileVersion[] };

type Patch = { id: string; commit: string; preimage: string; changeStarts: readonly number[] };

type Hunk = { commit: string; header: Record<string, string | undefined>; body: string[] };

type LineShift = { shiftsLinesAfter: number; delta: number };

type PatchCopies = { squashed: string[]; commitByCommit: string[][] };

const PATCH_OPTIONS = ["-p", "--no-color", "--no-ext-diff", "--no-textconv", "--no-renames", "--no-relative"];
const COMMIT_HEADER = "--format=commit %H";
const COMMIT_LINE = /^commit (?<commit>[0-9a-f]+)$/;
const FILE_HEADER = "diff ";
const HUNK_HEADER = /^@@ -(?<oldStart>\d+)(?:,(?<oldCount>\d+))? \+\d+(?:,(?<newCount>\d+))? @@/;
const NO_COMMIT = /^0+$/;
const OMITTED_HUNK_COUNT = "1";
const NO_NEWLINE_MARK = "\\";
const RAW_RECORD = /commit (?<commit>[0-9a-f]+)\0|:\d+ (?<mode>\d+) [0-9a-f]+ (?<object>[0-9a-f]+) [A-Z]\d*\0(?<path>[^\0]*)\0/g;

export async function contentLanded(repo: string, tip: string, git: GitRunner): Promise<boolean> {
  const branch = await branchChanges(repo, tip, [], git);
  if (branch === null) return false;
  if (branch.changed.length === 0) return true;
  const pathspecs = branch.changed.map(({ path }) => pathspecOf(path));
  const landed = await headChanges(repo, branch.fork, pathspecs, git);
  if (landed === null) return false;
  const landedVersions = new Set(landed.map(({ version }) => version));
  for (const { path, version } of branch.changed) {
    if (!landedVersions.has(version) && !(await changeLanded(repo, branch.fork, path, git))) return false;
  }
  return true;
}

export async function commitsCarryingContent(repo: string, tip: string, scope: string, git: GitRunner): Promise<string[]> {
  const branch = await branchChanges(repo, tip, [scope], git);
  if (branch === null || branch.changed.length === 0) return [];
  const head = await headChanges(repo, branch.fork, [scope], git);
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

async function headChanges(repo: string, { base }: Fork, pathspecs: readonly string[], git: GitRunner): Promise<CommitChange[] | null> {
  const rawLog = await git(repo, ["log", "--stdin", COMMIT_HEADER, "--raw", "-z", "--no-renames", "--no-abbrev", "--no-relative"], `${base}..HEAD\n--\n${pathspecs.join("\n")}\n`);
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
    patchesOf(repo, ["log", ...PATCH_OPTIONS, COMMIT_HEADER, "--topo-order", `${base}..HEAD`, ...onlyPath], parentOf, git),
  ]);
  if (squashedPatch === null || branchPatches === null || headPatches === null) return null;
  const copiesOf = async (change: Patch) => {
    const sameChange = headPatches.filter(({ id }) => id === change.id);
    const copiesAtSamePlace = await Promise.all(sameChange.map(async (copy) => ((await atSamePlace(repo, path, change, copy, git)) ? [copy.commit] : [])));
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
  const changeStarts = changeStartsByCommit(patches);
  return ids
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const [id = "", label = ""] = line.split(" ");
      const commit = NO_COMMIT.test(label) ? "" : label;
      return { id, commit, preimage: preimageOf(commit), changeStarts: changeStarts.get(commit) ?? [] };
    });
}

function changeStartsByCommit(patches: string): Map<string, number[]> {
  const hunks: Hunk[] = [];
  let currentCommit = "";
  let currentHunk: Hunk | undefined;
  for (const line of patches.split("\n")) {
    const commitOfLine = COMMIT_LINE.exec(line)?.groups?.commit;
    const header = HUNK_HEADER.exec(line)?.groups;
    if (commitOfLine !== undefined) currentCommit = commitOfLine;
    if (commitOfLine !== undefined || line.startsWith(FILE_HEADER)) currentHunk = undefined;
    else if (header !== undefined) {
      currentHunk = { commit: currentCommit, header, body: [] };
      hunks.push(currentHunk);
    } else currentHunk?.body.push(line);
  }
  return new Map([...groupBy(hunks, ({ commit }) => commit)].map(([commit, commitHunks]) => [commit, commitHunks.flatMap(changeStartsOf)]));
}

function changeStartsOf({ header: { oldStart, oldCount = OMITTED_HUNK_COUNT }, body }: Hunk): number[] {
  const starts: number[] = [];
  let oldLine = firstOldLine(oldStart, oldCount);
  let changing = false;
  for (const mark of body.map((line) => line.charAt(0))) {
    if (mark === NO_NEWLINE_MARK) continue;
    const changed = mark === "-" || mark === "+";
    if (changed && !changing) starts.push(oldLine);
    changing = changed;
    if (mark !== "+") oldLine += 1;
  }
  return starts;
}

async function atSamePlace(repo: string, path: string, change: Patch, copy: Patch, git: GitRunner): Promise<boolean> {
  if (change.changeStarts.length !== copy.changeStarts.length) return false;
  const preimageDiff = await git(repo, ["diff", ...PATCH_OPTIONS, "--unified=0", "--inter-hunk-context=0", change.preimage, copy.preimage, "--", pathspecOf(path)]);
  if (preimageDiff === null) return false;
  const shifts = preimageDiff.split("\n").flatMap((line) => {
    const header = HUNK_HEADER.exec(line)?.groups;
    return header === undefined ? [] : [lineShiftOf(header)];
  });
  return change.changeStarts.every((start, index) => shiftedLine(start, shifts) === copy.changeStarts[index]);
}

function lineShiftOf({ oldStart, oldCount = OMITTED_HUNK_COUNT, newCount = OMITTED_HUNK_COUNT }: Record<string, string | undefined> = {}): LineShift {
  const removed = Number(oldCount);
  return { shiftsLinesAfter: firstOldLine(oldStart, oldCount) + removed - 1, delta: Number(newCount) - removed };
}

function firstOldLine(oldStart: string | undefined, oldCount: string): number {
  const insertedAfterOldStart = Number(oldCount) === 0;
  return insertedAfterOldStart ? Number(oldStart) + 1 : Number(oldStart);
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
