import { join } from "node:path";
import { formatLocalDay } from "../core/model/dates";
import type { Project } from "../core/model/types";
import { costReport } from "../core/stats/cost/cost-report";
import type { CostReport } from "../core/stats/types";
import { createJsonlTail } from "../core/store/jsonl-tail";
import { cachedRepoRoots, findProjectForRoots, type GitRoots, type RepoRootLookup } from "../core/store/resolve-project";
import { cliRunSchema, RUNS_FILE, type CliRun } from "../core/store/runs";
import type { UsageCache } from "../core/usage/usage-cache";
import { createScopeMemo, createSnapshotIds } from "./source-memos";
import type { UsageSnapshot } from "./usage-scanner";

type CostScope = { snapshot: object; projects: readonly Project[]; projectId: string | undefined };

type CostInputs = { usage: UsageSnapshot; runs: readonly CliRun[]; scope: CostScope; now: Date };

type CostRequest = Omit<CostInputs, "runs">;

type CostSource = {
  costReport: (request: CostRequest) => Promise<CostReport>;
  retain: (projectIds: readonly string[]) => void;
};

export function createCostSource(root: string, home: string): CostSource {
  const runsTail = createJsonlTail<CliRun>(join(root, RUNS_FILE), cliRunSchema);
  const lookupRepoRoot = cachedRepoRoots();
  const costMemos = createScopeMemo<Promise<CostReport>>();
  const snapshotIdOf = createSnapshotIds();

  return {
    costReport: async (request) => {
      const { values: runs, length, generation } = await runsTail.read();
      const inputs: CostInputs = { ...request, runs };
      const keyParts: Record<keyof CostInputs, string> = {
        usage: `${inputs.usage.revision}`,
        runs: `${generation}:${length}`,
        scope: `${snapshotIdOf(inputs.scope.snapshot)}/${inputs.scope.projects.map((project) => project.id).join(",")}`,
        now: formatLocalDay(inputs.now),
      };
      return costMemos.get(Object.values(keyParts).join("|"), () => costOf(inputs, home, lookupRepoRoot), inputs.scope.projectId);
    },
    retain: costMemos.retain,
  };
}

async function costOf({ usage: { cache, scan }, runs, scope: { projects, projectId }, now }: CostInputs, home: string, lookupRepoRoot: RepoRootLookup): Promise<CostReport> {
  const buckets = bucketsOf(cache);
  const repoRoots =
    projectId === undefined
      ? new Map<string, GitRoots | null>()
      : await resolveRepoRoots(
          lookupRepoRoot,
          [...buckets, ...runs].map((entry) => entry.cwd),
        );
  const projectOf = (cwd: string) => {
    const roots = repoRoots.get(cwd) ?? null;
    return roots === null ? null : (findProjectForRoots(projects, roots, home)?.id ?? null);
  };
  return costReport({ buckets, runs, projectOf, projectId, now, scan });
}

function bucketsOf(cache: UsageCache) {
  return Object.values(cache.files).flatMap((entry) => entry.buckets);
}

async function resolveRepoRoots(lookupRepoRoot: RepoRootLookup, cwds: readonly string[]): Promise<Map<string, GitRoots | null>> {
  const unique = [...new Set(cwds)];
  return new Map(await Promise.all(unique.map(async (cwd) => [cwd, await lookupRepoRoot(cwd)] as const)));
}
