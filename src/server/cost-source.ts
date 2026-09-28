import { join } from "node:path";
import { formatLocalDay } from "../core/model/dates";
import type { Project } from "../core/model/types";
import type { CostReport } from "../core/stats/types";
import { createJsonlTail } from "../core/store/jsonl-tail";
import { cliRunSchema, RUNS_FILE, type CliRun } from "../core/store/runs";
import { createSnapshotIds, pruneUnlessKept } from "./source-memos";
import type { UsageSnapshot } from "./usage-scanner";

type CostScope = { snapshot: { projects: readonly Project[] }; projectId: string | undefined };

export type CostInputs = { usage: UsageSnapshot; runs: readonly CliRun[]; scope: CostScope; now: Date };

type CostRequest = Omit<CostInputs, "runs">;

type CostSource = {
  costReport: (request: CostRequest) => Promise<CostReport>;
  retain: (projectIds: readonly string[]) => void;
};

type RememberedCost = { key: string; report: Promise<CostReport> };

const ALL_PROJECTS_SLOT = "*";

export function createCostSource(root: string, computeCost: (inputs: CostInputs) => Promise<CostReport>): CostSource {
  const runsTail = createJsonlTail<CliRun>(join(root, RUNS_FILE), cliRunSchema);
  const costMemos = new Map<string, RememberedCost>();
  const snapshotIdOf = createSnapshotIds();

  return {
    costReport: async (request) => {
      const { values: runs, length, generation } = await runsTail.read();
      const inputs: CostInputs = { ...request, runs };
      const slot = inputs.scope.projectId ?? ALL_PROJECTS_SLOT;
      const keyParts: Record<keyof CostInputs, string> = {
        usage: `${inputs.usage.revision}`,
        runs: `${generation}:${length}`,
        scope: `${snapshotIdOf(inputs.scope.snapshot)}/${slot}`,
        now: formatLocalDay(inputs.now),
      };
      const key = Object.values(keyParts).join("|");
      const remembered = costMemos.get(slot);
      if (remembered?.key === key) return remembered.report;
      const report = computeCost(inputs);
      costMemos.set(slot, { key, report });
      report.catch(() => {
        if (costMemos.get(slot)?.report === report) costMemos.delete(slot);
      });
      return report;
    },
    retain: (projectIds) => pruneUnlessKept(costMemos, new Set(projectIds), (slot) => (slot === ALL_PROJECTS_SLOT ? undefined : slot)),
  };
}
