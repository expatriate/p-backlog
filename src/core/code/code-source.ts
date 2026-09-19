import { formatLocalIso } from "../model/dates";
import { DAY_MS } from "../model/lifecycle";
import type { Project } from "../model/types";
import { fixKey, type FixRequest } from "../stats/code/fixes";
import type { CollectedCode, FixCommit, ProjectCode, RepoCode } from "../stats/types";
import { expandHome } from "../store/paths";
import { readFixCommit, readHead, readMainCommit, readRepoCode, runGit, type GitRunner } from "./git-code";

const CHURN_DAYS = 90;

export type CodeSourceOptions = { home: string; git?: GitRunner };

export type CodeSource = {
  collect: (projects: readonly Project[], requests: readonly FixRequest[], now: Date) => Promise<CollectedCode>;
  stateKey: (projects: readonly Project[]) => Promise<string>;
};

export function createCodeSource({ home, git = runGit }: CodeSourceOptions): CodeSource {
  const repoCache = new Map<string, { key: string; code: RepoCode }>();
  const fixCache = new Map<string, FixCommit | null>();

  const repoCode = async (repo: string, now: Date): Promise<RepoCode | null> => {
    const head = await readHead(git, repo);
    if (head === null) return null;
    const mainCommit = await readMainCommit(git, repo);
    const key = `${head} ${mainCommit ?? ""} ${formatLocalIso(now).slice(0, 10)}`;
    const cached = repoCache.get(repo);
    if (cached?.key === key) return cached.code;
    const code = await readRepoCode(git, repo, new Date(now.getTime() - CHURN_DAYS * DAY_MS), mainCommit);
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
    stateKey: async (projects) => {
      const repos = [...new Set(projects.flatMap((project) => project.repos.map((repo) => expandHome(repo, home))))];
      const states = await Promise.all(repos.map(async (repo) => `${repo}@${(await readHead(git, repo)) ?? ""}:${(await readMainCommit(git, repo)) ?? ""}`));
      return states.join(" ");
    },
    collect: async (projects, requests, now) => {
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
      return { projects: projectCodes, unavailableRepos, fixCommits };
    },
  };
}
