import { formatLocalIso } from "../model/dates";
import { DAY_MS } from "../model/lifecycle";
import type { Project } from "../model/types";
import { CHURN_DAYS } from "../stats/code/churn";
import { fixKey, type FixRequest } from "../stats/code/fixes";
import type { CollectedCode, FixCommit, ProjectCode, RepoCode } from "../stats/types";
import { expandHome } from "../store/paths";
import { emptyCodeCache, type CodeCacheStore } from "./code-cache";
import { readFixCommit, readHead, readMainCommit, readRepoCode, runGit, type GitRunner } from "./git-code";


export type CodeSourceOptions = { home: string; git?: GitRunner; store?: CodeCacheStore };

export type CodeSource = {
  collect: (projects: readonly Project[], requests: readonly FixRequest[], now: Date) => Promise<CollectedCode>;
  stateKey: (projects: readonly Project[]) => Promise<string>;
};

export function createCodeSource({ home, git = runGit, store }: CodeSourceOptions): CodeSource {
  const repoCache = new Map<string, { key: string; code: RepoCode }>();
  const fixCache = new Map<string, FixCommit>();
  let changed = false;
  let restored: Promise<void> | null = null;

  const restore = (): Promise<void> => {
    restored ??= (store?.read() ?? Promise.resolve(emptyCodeCache())).then((snapshot) => {
      for (const [repo, entry] of Object.entries(snapshot.repos)) if (!repoCache.has(repo)) repoCache.set(repo, entry);
      for (const [key, commit] of Object.entries(snapshot.fixes)) if (!fixCache.has(key)) fixCache.set(key, commit);
    });
    return restored;
  };

  const persist = async (): Promise<void> => {
    if (store === undefined || !changed) return;
    changed = false;
    await store.write({ repos: Object.fromEntries(repoCache), fixes: Object.fromEntries(fixCache) }).catch((error: unknown) => {
      console.error(`Не удалось сохранить кэш git: ${error instanceof Error ? error.message : String(error)}`);
    });
  };

  const repoCode = async (repo: string, now: Date): Promise<RepoCode | null> => {
    const head = await readHead(git, repo);
    if (head === null) return null;
    const mainCommit = await readMainCommit(git, repo);
    const key = `${head} ${mainCommit ?? ""} ${formatLocalIso(now).slice(0, 10)}`;
    const cached = repoCache.get(repo);
    if (cached?.key === key) return cached.code;
    const code = await readRepoCode(git, repo, new Date(now.getTime() - CHURN_DAYS * DAY_MS), mainCommit);
    if (code !== null) {
      repoCache.set(repo, { key, code });
      changed = true;
    }
    return code;
  };

  const fixCommit = async (repo: string, hash: string): Promise<FixCommit | null> => {
    const cacheKey = `${repo} ${hash}`;
    const cached = fixCache.get(cacheKey);
    if (cached !== undefined) return cached;
    const commit = await readFixCommit(git, repo, hash);
    if (commit !== null) {
      fixCache.set(cacheKey, commit);
      changed = true;
    }
    return commit;
  };

  return {
    stateKey: async (projects) => {
      const repos = [...new Set(projects.flatMap((project) => project.repos.map((repo) => expandHome(repo, home))))];
      const states = await Promise.all(repos.map(async (repo) => `${repo}@${(await readHead(git, repo)) ?? ""}:${(await readMainCommit(git, repo)) ?? ""}`));
      return states.join(" ");
    },
    collect: async (projects, requests, now) => {
      await restore();
      const unavailableRepos: string[] = [];
      const available = new Map<string, string[]>();
      const projectCodes: ProjectCode[] = [];
      const seenUnavailable = new Set<string>();
      for (const project of projects) {
        const repos: RepoCode[] = [];
        for (const repo of project.repos) {
          const expanded = expandHome(repo, home);
          const code = await repoCode(expanded, now);
          if (code === null) {
            if (!seenUnavailable.has(repo)) {
              seenUnavailable.add(repo);
              unavailableRepos.push(repo);
            }
            continue;
          }
          repos.push(code);
          available.set(project.id, [...(available.get(project.id) ?? []), expanded]);
        }
        projectCodes.push({ projectId: project.id, name: project.name, repos });
      }
      const fixCommits = new Map<string, FixCommit>();
      for (const { projectId, hashes } of requests) {
        for (const hash of hashes) {
          for (const repo of available.get(projectId) ?? []) {
            const commit = await fixCommit(repo, hash);
            if (commit === null) continue;
            fixCommits.set(fixKey(projectId, hash), commit);
            break;
          }
        }
      }
      await persist();
      return { projects: projectCodes, unavailableRepos, fixCommits };
    },
  };
}
