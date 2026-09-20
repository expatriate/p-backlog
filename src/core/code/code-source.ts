import { errorText } from "../errors";
import { formatLocalDay } from "../model/dates";
import { DAY_MS } from "../model/lifecycle";
import type { Project } from "../model/types";
import { runGit, type GitRunner } from "../git/run";

import { fixKey, type FixRequest } from "../stats/code/fixes";
import type { CollectedCode, FixCommit, ProjectCode, RepoCode } from "../stats/types";
import { expandHome } from "../store/paths";
import { emptyCodeCache, type CodeCacheStore } from "./code-cache";
import { CHURN_DAYS } from "./code-window";
import { readFixCommits, readHead, readMainCommit, readRepoCode } from "./git-code";

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

  const dropStaleFixes = (now: Date): void => {
    const oldest = now.getTime() - CHURN_DAYS * DAY_MS;
    for (const [key, commit] of fixCache) {
      if (Date.parse(commit.date) >= oldest) continue;
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

  const inFlight = new Map<string, Promise<RepoCode | null>>();

  const repoCode = (repo: string, now: Date): Promise<RepoCode | null> => {
    const running = inFlight.get(repo);
    if (running !== undefined) return running;
    const started = readRepoOnce(repo, now).finally(() => inFlight.delete(repo));
    inFlight.set(repo, started);
    return started;
  };

  const readRepoOnce = async (repo: string, now: Date): Promise<RepoCode | null> => {
    const head = await readHead(git, repo);
    if (head === null) return null;
    const mainCommit = await readMainCommit(git, repo);
    const key = `${head} ${mainCommit ?? ""} ${formatLocalDay(now)}`;
    const cached = repoCache.get(repo);
    if (cached?.key === key) return cached.code;
    const code = await readRepoCode(git, repo, new Date(now.getTime() - CHURN_DAYS * DAY_MS), mainCommit);
    if (code !== null) {
      repoCache.set(repo, { key, code });
      changed = true;
    }
    return code;
  };

  const fixCommitsOf = async (repo: string, hashes: readonly string[]): Promise<void> => {
    const missing = hashes.filter((hash) => !fixCache.has(`${repo} ${hash}`));
    if (missing.length === 0) return;
    for (const [hash, commit] of await readFixCommits(git, repo, missing)) {
      fixCache.set(`${repo} ${hash}`, commit);
      changed = true;
    }
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
      const scanned = await Promise.all(
        projects.map(async (project) => ({
          project,
          repos: await Promise.all(project.repos.map(async (repo) => ({ repo, expanded: expandHome(repo, home), code: await repoCode(expandHome(repo, home), now) }))),
        })),
      );
      for (const { project, repos } of scanned) {
        const readable: RepoCode[] = [];
        for (const { repo, expanded, code } of repos) {
          if (code === null) {
            if (!seenUnavailable.has(repo)) {
              seenUnavailable.add(repo);
              unavailableRepos.push(repo);
            }
            continue;
          }
          readable.push(code);
          available.set(project.id, [...(available.get(project.id) ?? []), expanded]);
        }
        projectCodes.push({ projectId: project.id, name: project.name, repos: readable });
      }
      await Promise.all(requests.flatMap(({ projectId, hashes }) => (available.get(projectId) ?? []).map((repo) => fixCommitsOf(repo, hashes))));
      const fixCommits = new Map<string, FixCommit>();
      for (const { projectId, hashes } of requests) {
        for (const hash of hashes) {
          for (const repo of available.get(projectId) ?? []) {
            const commit = fixCache.get(`${repo} ${hash}`);
            if (commit === undefined) continue;
            fixCommits.set(fixKey(projectId, hash), commit);
            break;
          }
        }
      }
      dropStaleFixes(now);
      await persist();
      return { projects: projectCodes, unavailableRepos, fixCommits };
    },
  };
}
