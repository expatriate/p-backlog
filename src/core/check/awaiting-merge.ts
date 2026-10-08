import { outputLine, runGitOutcome, stdoutOf, type GitOutcome, type GitOutcomeRunner } from "../git/run";
import type { TaskOrigin } from "../journal/events";
import { remembered } from "../remembered";

export type PendingQuestion = { repo: string; taskIds: readonly string[]; origins: ReadonlyMap<string, TaskOrigin>; git?: GitOutcomeRunner };

type FileVersion = { path: string; version: string };

type Fork = { base: string; tip: string };

const NOT_AN_ANCESTOR_EXIT = 1;
const PATCH_OPTIONS = ["-p", "--no-color", "--no-ext-diff", "--no-textconv", "--no-renames", "--no-relative"];
const COMMIT_HEADER = "--format=commit %H";
const RAW_DIFF_ENTRY = /:\d+ (?<mode>\d+) [0-9a-f]+ (?<object>[0-9a-f]+) [A-Z]\d*\0(?<path>[^\0]*)\0/g;

export async function awaitingMerge({ repo, taskIds, origins, git = runGitOutcome }: PendingQuestion): Promise<Set<string>> {
  const branched = taskIds.flatMap((id) => {
    const origin = origins.get(id);
    return origin?.branch === undefined ? [] : [{ id, commit: origin.commit, branch: origin.branch }];
  });
  if (branched.length === 0) return new Set();
  const current = lineOf(await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]));
  const awaitingBranches = new Map<string, Promise<boolean>>();
  const pending = await Promise.all(
    branched.map(async ({ id, commit, branch }) => {
      if (branch === current) return [];
      const ancestry = await git(repo, ["merge-base", "--is-ancestor", commit, "HEAD"]);
      const notAnAncestor = ancestry.status === "exited" && ancestry.exitCode === NOT_AN_ANCESTOR_EXIT;
      if (!notAnAncestor) return [];
      return (await remembered(awaitingBranches, branch, () => branchAwaitsMerge(repo, branch, git))) ? [id] : [];
    }),
  );
  return new Set(pending.flat());
}

async function branchAwaitsMerge(repo: string, branch: string, git: GitOutcomeRunner): Promise<boolean> {
  const tip = lineOf(await git(repo, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]));
  return tip !== null && !(await contentLanded(repo, tip, git));
}

async function contentLanded(repo: string, tip: string, git: GitOutcomeRunner): Promise<boolean> {
  const base = lineOf(await git(repo, ["merge-base", "HEAD", tip]));
  if (base === null) return false;
  const changed = fileVersions(await git(repo, ["diff-tree", "-r", "-z", "--no-renames", base, tip]));
  if (changed === null) return false;
  if (changed.length === 0) return true;
  const pathspecs = changed.map(({ path }) => pathspecOf(path)).join("\n");
  const landed = fileVersions(await git(repo, ["log", "--stdin", "--format=", "--raw", "-z", "--no-renames", "--no-abbrev", "--no-relative"], `${base}..HEAD\n--\n${pathspecs}\n`));
  if (landed === null) return false;
  const landedVersions = new Set(landed.map(({ version }) => version));
  for (const { path, version } of changed) {
    if (!landedVersions.has(version) && !(await changeLanded(repo, { base, tip }, path, git))) return false;
  }
  return true;
}

async function changeLanded(repo: string, { base, tip }: Fork, path: string, git: GitOutcomeRunner): Promise<boolean> {
  const onlyPath = ["--", pathspecOf(path)];
  const [squashedPatch, branchPatches, headPatches] = await Promise.all([
    patchIdsOf(repo, ["diff", ...PATCH_OPTIONS, base, tip, ...onlyPath], git),
    patchIdsOf(repo, ["log", ...PATCH_OPTIONS, COMMIT_HEADER, `${base}..${tip}`, ...onlyPath], git),
    patchIdsOf(repo, ["log", ...PATCH_OPTIONS, COMMIT_HEADER, `${base}..HEAD`, ...onlyPath], git),
  ]);
  if (squashedPatch === null || branchPatches === null || headPatches === null) return false;
  const landed = new Set(headPatches);
  const landedSquashed = squashedPatch.some((patch) => landed.has(patch));
  const landedCommitByCommit = branchPatches.length > 0 && branchPatches.every((patch) => landed.has(patch));
  return landedSquashed || landedCommitByCommit;
}

async function patchIdsOf(repo: string, patchArgs: string[], git: GitOutcomeRunner): Promise<string[] | null> {
  const patches = stdoutOf(await git(repo, patchArgs));
  const ids = patches === null ? null : stdoutOf(await git(repo, ["patch-id", "--stable"], patches));
  if (ids === null) return null;
  return ids
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => line.split(" ")[0] ?? "");
}

function pathspecOf(path: string): string {
  return `:(top,literal)${path}`;
}

function fileVersions(rawDiff: GitOutcome): FileVersion[] | null {
  const output = stdoutOf(rawDiff);
  if (output === null) return null;
  return [...output.matchAll(RAW_DIFF_ENTRY)].map(({ groups: { mode = "", object = "", path = "" } = {} }) => ({ path, version: `${mode} ${object}\0${path}` }));
}

function lineOf(outcome: GitOutcome): string | null {
  return outputLine(stdoutOf(outcome));
}
