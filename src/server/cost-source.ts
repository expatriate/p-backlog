import { join } from "node:path";
import { costReport } from "../core/stats/cost/cost-report";
import type { CostReport } from "../core/stats/types";
import { createJsonlTail } from "../core/store/jsonl-tail";
import { cachedRepoRoots, lookupProjectForRecordedDir, unreadableDirHasNoRepo, type KnownProjects, type RecordedRepos, type RepoContext, type RepoRootLookup } from "../core/store/resolve-project";
import { cliRunSchema, RUNS_FILE, type CliRun } from "../core/store/runs";
import { usageBucketsOf } from "../core/usage/usage-cache";
import type { UsageSnapshot } from "./usage-scanner";

type CostRequest = { usage: UsageSnapshot; known: KnownProjects; projectId: string | undefined; now: Date };

type CostInputs = CostRequest & { runs: readonly CliRun[] };

type CostSource = {
  stateKey: (usage: UsageSnapshot) => Promise<string>;
  costReport: (request: CostRequest) => Promise<CostReport>;
};

export function createCostSource(root: string, home: string): CostSource {
  const runsTail = createJsonlTail<CliRun>(join(root, RUNS_FILE), cliRunSchema);
  const context: RepoContext = { home, onUnreadable: unreadableDirHasNoRepo };
  const lookupRepoRoot = cachedRepoRoots({ onUnreadable: unreadableDirHasNoRepo });

  return {
    stateKey: async (usage) => {
      const { length, generation } = await runsTail.read();
      return JSON.stringify([usage.revision, generation, length]);
    },
    costReport: async (request) => {
      const { values: runs } = await runsTail.read();
      return computeCostReport({ ...request, runs }, context, lookupRepoRoot);
    },
  };
}

async function computeCostReport({ usage: { cache, scan }, runs, known, projectId, now }: CostInputs, context: RepoContext, lookupRepoRoot: RepoRootLookup): Promise<CostReport> {
  const buckets = usageBucketsOf(cache);
  const projectIds =
    projectId === undefined
      ? new Map<string, string | null>()
      : await projectIdsOfCwds(
          [...buckets, ...runs].map((entry) => entry.cwd),
          known,
          context,
          { lookupRepoRoot, worktreeRepos: cache.worktreeRepos },
        );
  return costReport({ buckets, runs, projectOf: (cwd) => projectIds.get(cwd) ?? null, projectId, now, scan });
}

async function projectIdsOfCwds(cwds: readonly string[], known: KnownProjects, context: RepoContext, recordedRepos: RecordedRepos): Promise<Map<string, string | null>> {
  const projectIdOf = async (cwd: string) => {
    const lookup = await lookupProjectForRecordedDir(known, cwd, recordedRepos, context);
    return [cwd, "project" in lookup ? lookup.project.id : null] as const;
  };
  return new Map(await Promise.all([...new Set(cwds)].map(projectIdOf)));
}
