import type { Project } from "../model/types";
import { runGit, type GitRunner } from "../git/run";
import { expandHome } from "../store/paths";
import { remembered } from "../remembered";
import { cachePersistence } from "./cache-persistence";
import type { CodeCacheErrorKind, CodeCacheStore } from "./code-cache";
import { emptyCodeMemory, forgetStaleFixes, keepOnlyRepos, needsReading, rememberFix, type CodeMemory } from "./code-memory";
import { projectFixKey, repoFixKey, type ProjectFixKey, type RepoFixKey } from "./fix-key";
import { readRefs, type RepoRefs } from "./git-code";
import { readFixCommits } from "./git-fixes";
import { repoCodeOf, scanRepo } from "./repo-scan";
import type { FixCommit, FixRequest, ProjectCode, RepoCode, ScannedCode } from "./types";

export type CodeSourceOptions = { home: string; git?: GitRunner; store?: CodeCacheStore; onError?: (kind: CodeCacheErrorKind, error: unknown) => void };

export type CodeSource = {
  collect: (projects: readonly Project[], now: Date) => Promise<ScannedCode>;
  fixCommits: (projects: readonly Project[], requests: readonly FixRequest[], now: Date) => Promise<ReadonlyMap<ProjectFixKey, FixCommit>>;
  stateKey: (projects: readonly Project[]) => Promise<string>;
  retain: (backlogProjects: readonly Project[]) => void;
};

type FixRepo = { repo: string; main: string | null };

export function createCodeSource({ home, git = runGit, store, onError = () => {} }: CodeSourceOptions): CodeSource {
  const memory = emptyCodeMemory();
  const cache = cachePersistence(memory, store, onError);
  const repoCode = repoReader(git, memory);
  let retainedRepos: ReadonlySet<string> | null = null;
  const pruneAndPersist = () => {
    if (retainedRepos !== null) keepOnlyRepos(memory, retainedRepos);
    return cache.persist();
  };
  const expanded = (projects: readonly Project[]) => [...new Set(projects.flatMap((project) => project.repos.map((repo) => expandHome(repo, home))))];

  return {
    retain: (backlogProjects) => {
      retainedRepos = new Set(expanded(backlogProjects));
    },
    stateKey: async (projects) => {
      const states = await Promise.all(expanded(projects).map(async (repo) => `${repo}@${refsKey(await readRefs(git, repo))}`));
      return states.join(" ");
    },
    collect: async (projects, now) => {
      await cache.restore();
      const scanned = await Promise.all(
        projects.map(async (project) => ({
          project,
          repos: await Promise.all(project.repos.map(async (repo) => ({ repo, read: await repoCode(expandHome(repo, home), now) }))),
        })),
      );
      const projectCodes = scanned.map(({ project, repos }): ProjectCode => ({ projectId: project.id, name: project.name, repos: repos.flatMap(({ read }) => (read === null ? [] : [read])) }));
      const unavailableRepos = [...new Set(scanned.flatMap(({ repos }) => repos.filter(({ read }) => read === null).map(({ repo }) => repo)))];
      await pruneAndPersist();
      return { projects: projectCodes, unavailableRepos };
    },
    fixCommits: async (projects, requests, now) => {
      await cache.restore();
      const reposOf = await fixReposOf(git, projects, home);
      const reposOfProject = (projectId: string) => reposOf.get(projectId) ?? [];
      await Promise.all(requests.flatMap(({ projectId, hashes }) => reposOfProject(projectId).map((fixRepo) => readMissingFixes(git, memory, fixRepo, hashes))));
      const lookups = fixLookups(requests, reposOfProject);
      const found = new Map(lookups.flatMap(({ key, repoKeys }) => cachedFixEntries(memory, key, repoKeys)));
      forgetStaleFixes(memory, now, new Set(lookups.flatMap(({ repoKeys }) => repoKeys)));
      await pruneAndPersist();
      return found;
    },
  };
}

function repoReader(git: GitRunner, memory: CodeMemory): (repo: string, now: Date) => Promise<RepoCode | null> {
  const inFlight = new Map<string, Promise<RepoCode | null>>();
  const readOnce = async (repo: string, now: Date): Promise<RepoCode | null> => {
    const scan = await scanRepo(git, repo, { refs: await readRefs(git, repo), now, previous: memory.repos.get(repo) });
    if (scan === null) return null;
    memory.repos.set(repo, scan);
    return repoCodeOf(scan);
  };
  return (repo, now) => remembered(inFlight, repo, () => readOnce(repo, now).finally(() => inFlight.delete(repo)));
}

type FixLookup = { key: ProjectFixKey; repoKeys: RepoFixKey[] };

function fixLookups(requests: readonly FixRequest[], reposOfProject: (projectId: string) => readonly FixRepo[]): FixLookup[] {
  return requests.flatMap(({ projectId, hashes }) => hashes.map((hash) => ({ key: projectFixKey(projectId, hash), repoKeys: reposOfProject(projectId).map(({ repo }) => repoFixKey(repo, hash)) })));
}

function cachedFixEntries(memory: CodeMemory, key: ProjectFixKey, repoKeys: readonly RepoFixKey[]): [ProjectFixKey, FixCommit][] {
  const commit = repoKeys.map((repoKey) => memory.fixes.get(repoKey)).find((cached) => cached !== undefined);
  return commit === undefined ? [] : [[key, commit]];
}

async function readMissingFixes(git: GitRunner, memory: CodeMemory, { repo, main }: FixRepo, hashes: readonly string[]): Promise<void> {
  const unsettled = hashes.filter((hash) => needsReading(memory, repoFixKey(repo, hash), main));
  if (unsettled.length === 0) return;
  const found = await readFixCommits(git, repo, { hashes: unsettled, mainCommit: main });
  for (const [hash, commit] of found ?? []) rememberFix(memory, repoFixKey(repo, hash), main, commit);
}

async function fixReposOf(git: GitRunner, projects: readonly Project[], home: string): Promise<Map<string, FixRepo[]>> {
  const refsOf = new Map<string, Promise<RepoRefs>>();
  const refsOnce = (repo: string): Promise<RepoRefs> => remembered(refsOf, repo, () => readRefs(git, repo));
  const entries = await Promise.all(
    projects.map(async (project) => {
      const repos = await Promise.all(
        project.repos.map(async (repo) => {
          const expanded = expandHome(repo, home);
          const refs = await refsOnce(expanded);
          return refs.head === null ? [] : [{ repo: expanded, main: refs.main }];
        }),
      );
      return [project.id, repos.flat()] as const;
    }),
  );
  return new Map(entries);
}

function refsKey(refs: RepoRefs): string {
  return `${refs.head ?? ""} ${refs.main ?? ""}`;
}
