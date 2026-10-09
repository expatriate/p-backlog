import { groupBy } from "../collections";
import { outputLine, type GitRunner } from "../git/run";
import { remembered } from "../remembered";

type FileVersion = { path: string; version: string };

type CommitChange = FileVersion & { commit: string };

type Fork = { base: string; tip: string };

type BranchChanges = { fork: Fork; changed: FileVersion[] };

type PatchId = { id: string; commit: string };

type PatchCopies = { squashed: string[]; commitByCommit: string[][] };

const PATCH_OPTIONS = ["-p", "--no-color", "--no-ext-diff", "--no-textconv", "--no-renames", "--no-relative"];
const COMMIT_HEADER = "--format=commit %H";
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
    patchIdsOf(repo, ["diff", ...PATCH_OPTIONS, base, tip, ...onlyPath], git),
    patchIdsOf(repo, ["log", ...PATCH_OPTIONS, COMMIT_HEADER, `${base}..${tip}`, ...onlyPath], git),
    patchIdsOf(repo, ["log", ...PATCH_OPTIONS, COMMIT_HEADER, "--topo-order", `${base}..HEAD`, ...onlyPath], git),
  ]);
  if (squashedPatch === null || branchPatches === null || headPatches === null) return null;
  const copiesOf = ({ id }: PatchId) => headPatches.filter((patch) => patch.id === id).map(({ commit }) => commit);
  return { squashed: squashedPatch.flatMap(copiesOf), commitByCommit: branchPatches.map(copiesOf) };
}

async function patchIdsOf(repo: string, patchArgs: string[], git: GitRunner): Promise<PatchId[] | null> {
  const patches = await git(repo, patchArgs);
  const ids = patches === null ? null : await git(repo, ["patch-id", "--stable"], patches);
  if (ids === null) return null;
  return ids
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const [id = "", commit = ""] = line.split(" ");
      return { id, commit };
    });
}

function pathspecOf(path: string): string {
  return `:(top,literal)${path}`;
}

function fileVersion({ mode = "", object = "", path = "" }: Record<string, string | undefined> = {}): FileVersion {
  return { path, version: `${mode} ${object}\0${path}` };
}
