import { join } from "node:path";
import { journalEventSchema, type JournalEvent, type ProjectJournal } from "../core/journal/events";
import { formatLocalDay } from "../core/model/dates";
import type { Project } from "../core/model/types";
import { reportBase, type ReportBase, type StatsInput } from "../core/stats/scope";
import type { CostReport } from "../core/stats/types";
import { JOURNAL_FILE, projectJournal } from "../core/store/journal";
import { createJsonlTail, type JsonlTail } from "../core/store/jsonl-tail";
import { cliRunSchema, RUNS_FILE, type CliRun } from "../core/store/runs";
import type { UsageSnapshot } from "./usage-scanner";

type BaseSlot = "scoped" | "backlog";

type ScopeSources = { journals: ProjectJournal[]; baseOf: (slot: BaseSlot, input: StatsInput) => ReportBase };

type CostScope = { snapshot: object; projectId: string | undefined; projects: readonly Project[] };

export type CostInputs = { usage: UsageSnapshot; runs: readonly CliRun[]; scope: CostScope; now: Date };

type CostRequest = Omit<CostInputs, "runs">;

export type StatsSources = {
  read: (snapshot: object, projectIds: readonly string[]) => Promise<ScopeSources>;
  retain: (projectIds: readonly string[]) => void;
  costReport: (request: CostRequest) => Promise<CostReport>;
};

type TailedJournal = { journal: ProjectJournal; position: string };

type RememberedBase = { projectId: string | undefined; key: string; base: ReportBase };

type RememberedCost = { key: string; report: Promise<CostReport> };

const ALL_PROJECTS_SLOT = "*";

export function createStatsSources(root: string, computeCost: (inputs: CostInputs) => Promise<CostReport>): StatsSources {
  const tails = new Map<string, JsonlTail<JournalEvent>>();
  const bases = new Map<string, RememberedBase>();
  const runsTail = createJsonlTail<CliRun>(join(root, RUNS_FILE), cliRunSchema);
  const costMemos = new Map<string, RememberedCost>();
  const snapshotIds = new WeakMap<object, number>();
  let lastSnapshotId = 0;

  const snapshotIdOf = (snapshot: object): number => {
    const known = snapshotIds.get(snapshot);
    if (known !== undefined) return known;
    lastSnapshotId += 1;
    snapshotIds.set(snapshot, lastSnapshotId);
    return lastSnapshotId;
  };

  const tailOf = (projectId: string) => {
    const known = tails.get(projectId);
    if (known !== undefined) return known;
    const created = createJsonlTail(join(root, projectId, JOURNAL_FILE), journalEventSchema);
    tails.set(projectId, created);
    return created;
  };

  const readTailed = async (projectId: string): Promise<TailedJournal> => {
    const { length, generation, ...lines } = await tailOf(projectId).read();
    return { journal: projectJournal(projectId, lines), position: `${projectId}=${generation}:${length}` };
  };

  const rememberedBase = (snapshot: object, tailed: readonly TailedJournal[]) => (slot: BaseSlot, input: StatsInput) => {
    const slotKey = `${slot}|${input.projectId ?? "*"}`;
    const positions = tailed.filter(({ journal }) => input.projectId === undefined || journal.projectId === input.projectId).map(({ position }) => position);
    const key = `${snapshotIdOf(snapshot)}|${slotKey}|${positions.join(",")}`;
    const remembered = bases.get(slotKey);
    if (remembered?.key === key) return remembered.base;
    const base = reportBase(input);
    bases.set(slotKey, { projectId: input.projectId, key, base });
    return base;
  };

  return {
    read: async (snapshot, projectIds) => {
      const tailed = await Promise.all(projectIds.map(readTailed));
      return { journals: tailed.map(({ journal }) => journal), baseOf: rememberedBase(snapshot, tailed) };
    },
    retain: (projectIds) => {
      const kept = new Set(projectIds);
      pruneUnlessKept(tails, kept, (projectId) => projectId);
      pruneUnlessKept(bases, kept, (_, { projectId }) => projectId);
      pruneUnlessKept(costMemos, kept, (slot) => (slot === ALL_PROJECTS_SLOT ? undefined : slot));
    },
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
  };
}

function pruneUnlessKept<K, V>(map: Map<K, V>, kept: ReadonlySet<string>, projectIdOf: (key: K, value: V) => string | undefined): void {
  for (const [key, value] of map) {
    const projectId = projectIdOf(key, value);
    if (projectId !== undefined && !kept.has(projectId)) map.delete(key);
  }
}
