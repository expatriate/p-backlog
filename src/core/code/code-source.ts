import { formatLocalIso } from "../model/dates";
import { DAY_MS } from "../model/lifecycle";
import type { Project } from "../model/types";
import { fixKey, type FixRequest } from "../stats/code/fixes";
import type { CollectedCode, FixCommit, ProjectCode, RepoCode } from "../stats/types";
import { readFixCommit, readHead, readRepoCode, runGit, type GitRunner } from "./git-code";

const CHURN_DAYS = 90;

export type CodeSource = { collect: (projects: readonly Project[], requests: readonly FixRequest[], now: Date) => Promise<CollectedCode> };

export function createCodeSource(git: GitRunner = runGit): CodeSource {
  const repoCache = new Map<string, { key: string; code: RepoCode }>();
  const fixCache = new Map<string, FixCommit | null>();

  const repoCode = async (repo: string, now: Date): Promise<RepoCode | null> => {
    const head = await readHead(git, repo);
    if (head === null) return null;
    const key = `${head} ${formatLocalIso(now).slice(0, 10)}`;
    const cached = repoCache.get(repo);
    if (cached?.key === key) return cached.code;
    const code = await readRepoCode(git, repo, new Date(now.getTime() - CHURN_DAYS * DAY_MS));
    if (code !== null) repoCache.set(repo, { key, code });
    return code;
  };

  const fixCommit = async (repo: string, hash: string): Promise<FixCommit | null> => {
    const cacheKey = `${repo} ${hash}`;
    if (fixCache.has(cacheKey)) return fixCache.get(cacheKey) ?? null;
    const commit = await readFixCommit(git, repo, hash);
    fixCache.set(cacheKey, commit);
    return commit;
  };

  return {
    collect: async (projects, requests, now) => {
      const unavailableRepos: string[] = [];
      const available = new Map<string, string[]>();
      const projectCodes: ProjectCode[] = [];
      for (const project of projects) {
        const repos: RepoCode[] = [];
        for (const repo of project.repos) {
          const code = await repoCode(repo, now);
          if (code === null) {
            unavailableRepos.push(repo);
            continue;
          }
          repos.push(code);
          available.set(project.id, [...(available.get(project.id) ?? []), repo]);
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
      return { projects: projectCodes, unavailableRepos, fixCommits };
    },
  };
}
