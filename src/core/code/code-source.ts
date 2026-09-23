import { errorText } from "../errors";
import { formatLocalDay } from "../model/dates";
import { DAY_MS } from "../model/lifecycle";
import type { Project } from "../model/types";
import { runGit, type GitRunner } from "../git/run";
import { fixKey, type FixRequest } from "../stats/code/fixes";
import type { FixCommit, ProjectCode, RepoCode, ScannedCode } from "../stats/types";
import { expandHome } from "../store/paths";
import { emptyCodeCache, type CodeCacheSnapshot, type CodeCacheStore } from "./code-cache";
import { CHURN_DAYS } from "./code-window";
import { readFixCommits, readRefs, readRepoCode, type RepoRefs } from "./git-code";

export type CodeSourceOptions = { home: string; git?: GitRunner; store?: CodeCacheStore };

export type CodeSource = {
  collect: (projects: readonly Project[], now: Date) => Promise<ScannedCode>;
  fixCommits: (projects: readonly Project[], requests: readonly FixRequest[], now: Date) => Promise<ReadonlyMap<string, FixCommit>>;
  stateKey: (projects: readonly Project[]) => Promise<string>;
};

export function createCodeSource({ home, git = runGit, store }: CodeSourceOptions): CodeSource {
  const repoCache = new Map<string, { key: string; code: RepoCode }>();
  const fixCache = new Map<string, FixCommit>();
  let changed = false;
  let restored: Promise<void> | null = null;

  const restore = (): Promise<void> => {
    restored ??= readSnapshot(store).then((snapshot) => {
      for (const [repo, entry] of Object.entries(snapshot.repos)) if (!repoCache.has(repo)) repoCache.set(repo, entry);
      for (const [key, commit] of Object.entries(snapshot.fixes)) if (!fixCache.has(key)) fixCache.set(key, commit);
    });
    return restored;
  };

  const dropStaleFixes = (now: Date, requested: ReadonlySet<string>): void => {
    const oldest = now.getTime() - CHURN_DAYS * DAY_MS;
    for (const [key, commit] of fixCache) {
      if (requested.has(key) || Date.parse(commit.date) >= oldest) continue;
      fixCache.delete(key);
      changed = true;
    }
  };

  const persist = async (): Promise<void> => {
    if (store === undefined || !changed) return;
    changed = false;
    await store.write({ repos: Object.fromEntries(repoCache), fixes: Object.fromEntries(fixCache) }).catch((error: unknown) => {
      console.error(`Не удалось сохранить кэш git: ${errorText(error)}`);
    });
  };

  const inFlight = new Map<string, Promise<ReadRepo | null>>();

  const repoCode = (repo: string, now: Date): Promise<ReadRepo | null> => {
    const running = inFlight.get(repo);
    if (running !== undefined) return running;
    const started = readRepoOnce(repo, now).finally(() => inFlight.delete(repo));
    inFlight.set(repo, started);
    return started;
  };

  const readRepoOnce = async (repo: string, now: Date): Promise<ReadRepo | null> => {
    const refs = await readRefs(git, repo);
    if (refs.head === null) return null;
    const key = repoKey(refs, now);
    const cached = repoCache.get(repo);
    if (cached?.key === key) return { key, code: cached.code };
    const code = await readRepoCode(git, repo, new Date(now.getTime() - CHURN_DAYS * DAY_MS), refs.main);
    if (code === null) return null;
    repoCache.set(repo, { key, code });
    changed = true;
    return { key, code };
  };

  const fixCommitsOf = async (repo: string, hashes: readonly string[]): Promise<void> => {
    const unknown = hashes.filter((hash) => !fixCache.has(`${repo} ${hash}`));
    if (unknown.length === 0) return;
    const found = await readFixCommits(git, repo, unknown);
    for (const [hash, commit] of found ?? []) {
      fixCache.set(`${repo} ${hash}`, commit);
      changed = true;
    }
  };

  const fixReposOf = async (projects: readonly Project[], now: Date): Promise<Map<string, { repo: string; key: string }[]>> => {
    const refsOf = new Map<string, Promise<RepoRefs>>();
    const refsOnce = (repo: string): Promise<RepoRefs> => {
      const known = refsOf.get(repo) ?? readRefs(git, repo);
      refsOf.set(repo, known);
      return known;
    };
    const entries = await Promise.all(
      projects.map(async (project) => {
        const repos = await Promise.all(
          project.repos.map(async (repo) => {
            const expanded = expandHome(repo, home);
            const refs = await refsOnce(expanded);
            return refs.head === null ? [] : [{ repo: expanded, key: repoKey(refs, now) }];
          }),
        );
        return [project.id, repos.flat()] as const;
      }),
    );
    return new Map(entries);
  };

  return {
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
            readable.push(read.code);
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
      const reposOf = await fixReposOf(projects, now);
      await Promise.all(requests.flatMap(({ projectId, hashes }) => (reposOf.get(projectId) ?? []).map(({ repo }) => fixCommitsOf(repo, hashes))));
      const found = new Map<string, FixCommit>();
      const requested = new Set<string>();
      for (const { projectId, hashes } of requests) {
        for (const hash of hashes) {
          const keys = (reposOf.get(projectId) ?? []).map(({ repo }) => `${repo} ${hash}`);
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

type ReadRepo = { key: string; code: RepoCode };

function refsKey(refs: RepoRefs): string {
  return `${refs.head ?? ""} ${refs.main ?? ""}`;
}

function repoKey(refs: RepoRefs, now: Date): string {
  return `${refsKey(refs)} ${formatLocalDay(now)}`;
}

async function readSnapshot(store: CodeCacheStore | undefined): Promise<CodeCacheSnapshot> {
  try {
    return (await store?.read()) ?? emptyCodeCache();
  } catch (error) {
    console.error(`Не удалось прочитать кэш git: ${errorText(error)}`);
    return emptyCodeCache();
  }
}
