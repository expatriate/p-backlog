import type { Project } from "../model/types";
import { runGit, type GitRunner } from "../git/run";
import { fixKey, type FixRequest } from "../stats/code/fixes";
import type { FixCommit, ProjectCode, RepoCode, ScannedCode } from "../stats/types";
import { expandHome } from "../store/paths";
import { remembered } from "../remembered";
import { emptyCodeCache, type CodeCacheSnapshot, type CodeCacheStore } from "./code-cache";
import { churnWindowStart } from "./code-window";
import { readFixCommits, readRefs, type RepoRefs } from "./git-code";
import { repoCodeOf, scanRepo, type RepoScan } from "./repo-scan";

export type CodeCacheErrorKind = "read" | "write";

export type CodeSourceOptions = { home: string; git?: GitRunner; store?: CodeCacheStore; onError?: (kind: CodeCacheErrorKind, error: unknown) => void };

export type CodeSource = {
  collect: (projects: readonly Project[], now: Date) => Promise<ScannedCode>;
  fixCommits: (projects: readonly Project[], requests: readonly FixRequest[], now: Date) => Promise<ReadonlyMap<string, FixCommit>>;
  stateKey: (projects: readonly Project[]) => Promise<string>;
  retain: (backlogProjects: readonly Project[]) => void;
};

export function createCodeSource({ home, git = runGit, store, onError = () => {} }: CodeSourceOptions): CodeSource {
  const repoCache = new Map<string, RepoScan>();
  const fixCache = new Map<string, FixCommit>();
  const unsettledCheckedAt = new Map<string, string | null>();
  let changed = false;
  let restored: Promise<void> | null = null;
  let retainedRepos: ReadonlySet<string> | null = null;

  const restore = (): Promise<void> => {
    restored ??= readSnapshot(store, (error) => onError("read", error)).then((snapshot) => {
      for (const [repo, entry] of Object.entries(snapshot.repos)) if (!repoCache.has(repo)) repoCache.set(repo, entry);
      for (const [key, commit] of Object.entries(snapshot.fixes)) if (!fixCache.has(key)) fixCache.set(key, commit);
      for (const [key, main] of Object.entries(snapshot.unsettled)) if (!unsettledCheckedAt.has(key)) unsettledCheckedAt.set(key, main);
    });
    return restored;
  };

  const dropStaleFixes = (now: Date, requested: ReadonlySet<string>): void => {
    const oldest = churnWindowStart(now).getTime();
    for (const [key, commit] of fixCache) {
      if (requested.has(key) || Date.parse(commit.date) >= oldest) continue;
      fixCache.delete(key);
      unsettledCheckedAt.delete(key);
      changed = true;
    }
  };

  const dropUnretainedRepos = (): void => {
    if (retainedRepos === null) return;
    const kept = retainedRepos;
    for (const repo of repoCache.keys()) {
      if (kept.has(repo)) continue;
      repoCache.delete(repo);
      changed = true;
    }
    for (const key of new Set([...fixCache.keys(), ...unsettledCheckedAt.keys()])) {
      if (kept.has(repoOfFixCacheKey(key))) continue;
      fixCache.delete(key);
      unsettledCheckedAt.delete(key);
      changed = true;
    }
  };

  let writing: Promise<void> = Promise.resolve();

  const persist = (): Promise<void> => {
    dropUnretainedRepos();
    if (store === undefined || !changed) return writing;
    changed = false;
    const snapshot: CodeCacheSnapshot = { repos: Object.fromEntries(repoCache), fixes: Object.fromEntries(fixCache), unsettled: Object.fromEntries(unsettledCheckedAt) };
    writing = writing.then(() =>
      store.write(snapshot).catch((error: unknown) => {
        changed = true;
        onError("write", error);
      }),
    );
    return writing;
  };

  const inFlight = new Map<string, Promise<RepoCode | null>>();

  const repoCode = (repo: string, now: Date): Promise<RepoCode | null> => {
    const running = inFlight.get(repo);
    if (running !== undefined) return running;
    const started = readRepoOnce(repo, now).finally(() => inFlight.delete(repo));
    inFlight.set(repo, started);
    return started;
  };

  const readRepoOnce = async (repo: string, now: Date): Promise<RepoCode | null> => {
    const previous = repoCache.get(repo);
    const scan = await scanRepo(git, repo, { refs: await readRefs(git, repo), now, previous });
    if (scan === null) return null;
    if (scan !== previous) {
      repoCache.set(repo, scan);
      changed = true;
    }
    return repoCodeOf(scan);
  };

  const rememberUnsettled = (key: string, main: string | null, commit: FixCommit): void => {
    const checkedAt = commit.landedAt === undefined ? main : undefined;
    if (unsettledCheckedAt.get(key) === checkedAt) return;
    if (checkedAt === undefined) unsettledCheckedAt.delete(key);
    else unsettledCheckedAt.set(key, checkedAt);
    changed = true;
  };

  const needsReading = (key: string, main: string | null): boolean => {
    const cached = fixCache.get(key);
    return cached === undefined || (cached.landedAt === undefined && unsettledCheckedAt.get(key) !== main);
  };

  const fixCommitsOf = async (repo: string, main: string | null, hashes: readonly string[]): Promise<void> => {
    const unsettled = hashes.filter((hash) => needsReading(fixCacheKey(repo, hash), main));
    if (unsettled.length === 0) return;
    const found = await readFixCommits(git, repo, { hashes: unsettled, mainCommit: main });
    for (const [hash, commit] of found ?? []) {
      const key = fixCacheKey(repo, hash);
      rememberUnsettled(key, main, commit);
      if (fixCache.has(key) && commit.landedAt === undefined) continue;
      fixCache.set(key, commit);
      changed = true;
    }
  };

  const fixReposOf = async (projects: readonly Project[]): Promise<Map<string, { repo: string; main: string | null }[]>> => {
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
  };

  return {
    retain: (backlogProjects) => {
      retainedRepos = new Set(backlogProjects.flatMap((project) => project.repos.map((repo) => expandHome(repo, home))));
    },
    stateKey: async (projects) => {
      const repos = [...new Set(projects.flatMap((project) => project.repos.map((repo) => expandHome(repo, home))))];
      const states = await Promise.all(repos.map(async (repo) => `${repo}@${refsKey(await readRefs(git, repo))}`));
      return states.join(" ");
    },
    collect: async (projects, now) => {
      await restore();
      const unavailableRepos: string[] = [];
      const projectCodes: ProjectCode[] = [];
      const seenUnavailable = new Set<string>();
      const scanned = await Promise.all(
        projects.map(async (project) => ({
          project,
          repos: await Promise.all(project.repos.map(async (repo) => ({ repo, read: await repoCode(expandHome(repo, home), now) }))),
        })),
      );
      for (const { project, repos } of scanned) {
        const readable: RepoCode[] = [];
        for (const { repo, read } of repos) {
          if (read !== null) {
            readable.push(read);
          } else if (!seenUnavailable.has(repo)) {
            seenUnavailable.add(repo);
            unavailableRepos.push(repo);
          }
        }
        projectCodes.push({ projectId: project.id, name: project.name, repos: readable });
      }
      await persist();
      return { projects: projectCodes, unavailableRepos };
    },
    fixCommits: async (projects, requests, now) => {
      await restore();
      const reposOf = await fixReposOf(projects);
      await Promise.all(requests.flatMap(({ projectId, hashes }) => (reposOf.get(projectId) ?? []).map(({ repo, main }) => fixCommitsOf(repo, main, hashes))));
      const found = new Map<string, FixCommit>();
      const requested = new Set<string>();
      for (const { projectId, hashes } of requests) {
        for (const hash of hashes) {
          const keys = (reposOf.get(projectId) ?? []).map(({ repo }) => fixCacheKey(repo, hash));
          for (const key of keys) requested.add(key);
          const commit = keys.map((key) => fixCache.get(key)).find((cached) => cached !== undefined);
          if (commit !== undefined) found.set(fixKey(projectId, hash), commit);
        }
      }
      dropStaleFixes(now, requested);
      await persist();
      return found;
    },
  };
}

function fixCacheKey(repo: string, hash: string): string {
  return `${repo} ${hash}`;
}

function repoOfFixCacheKey(key: string): string {
  return key.slice(0, key.lastIndexOf(" "));
}

function refsKey(refs: RepoRefs): string {
  return `${refs.head ?? ""} ${refs.main ?? ""}`;
}

async function readSnapshot(store: CodeCacheStore | undefined, onError: (error: unknown) => void): Promise<CodeCacheSnapshot> {
  try {
    return (await store?.read()) ?? emptyCodeCache();
  } catch (error) {
    onError(error);
    return emptyCodeCache();
  }
}
