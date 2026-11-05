import { join } from "node:path";
import type { Project } from "../core/model/types";
import { costReport } from "../core/stats/cost/cost-report";
import type { CostReport } from "../core/stats/types";
import { createJsonlTail } from "../core/store/jsonl-tail";
import { cachedRepoRoots, findProjectForRoots, type GitRoots, type RepoPlaces, type RepoRootLookup } from "../core/store/resolve-project";
import { cliRunSchema, RUNS_FILE, type CliRun } from "../core/store/runs";
import type { UsageCache } from "../core/usage/usage-cache";
import type { UsageSnapshot } from "./usage-scanner";

type CostRequest = { usage: UsageSnapshot; projects: readonly Project[]; projectId: string | undefined; now: Date };

type CostInputs = CostRequest & { runs: readonly CliRun[] };

type CostSource = {
  stateKey: (usage: UsageSnapshot) => Promise<string>;
  costReport: (request: CostRequest) => Promise<CostReport>;
};

export function createCostSource(root: string, home: string): CostSource {
  const runsTail = createJsonlTail<CliRun>(join(root, RUNS_FILE), cliRunSchema);
  const places: RepoPlaces = { home, onUnreadable: unreadablePathHasNoProject };
  const lookupRepoRoot = cachedRepoRoots({ onUnreadable: unreadablePathHasNoProject });

  return {
    stateKey: async (usage) => {
      const { length, generation } = await runsTail.read();
      return JSON.stringify([usage.revision, generation, length]);
    },
    costReport: async (request) => {
      const { values: runs } = await runsTail.read();
      return computeCostReport({ ...request, runs }, places, lookupRepoRoot);
    },
  };
}

async function computeCostReport({ usage: { cache, scan }, runs, projects, projectId, now }: CostInputs, places: RepoPlaces, lookupRepoRoot: RepoRootLookup): Promise<CostReport> {
  const buckets = usageBucketsOf(cache);
  const repoRoots =
    projectId === undefined
      ? new Map<string, GitRoots | null>()
      : await resolveRepoRoots(
          lookupRepoRoot,
          [...buckets, ...runs].map((entry) => entry.cwd),
        );
  const projectOf = (cwd: string) => {
    const roots = repoRoots.get(cwd) ?? null;
    return roots === null ? null : (findProjectForRoots(projects, roots, places)?.id ?? null);
  };
  return costReport({ buckets, runs, projectOf, projectId, now, scan });
}

function unreadablePathHasNoProject(): void {}

function usageBucketsOf(cache: UsageCache) {
  return Object.values(cache.files).flatMap((entry) => entry.buckets);
}

async function resolveRepoRoots(lookupRepoRoot: RepoRootLookup, cwds: readonly string[]): Promise<Map<string, GitRoots | null>> {
  const unique = [...new Set(cwds)];
  return new Map(await Promise.all(unique.map(async (cwd) => [cwd, await lookupRepoRoot(cwd)] as const)));
}
