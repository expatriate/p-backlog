import { join } from "node:path";
import { journalEventSchema, type JournalEvent, type ProjectJournal } from "../core/journal/events";
import { formatLocalDay } from "../core/model/dates";
import { reportBase, type ReportBase, type StatsInput } from "../core/stats/scope";
import type { CostReport } from "../core/stats/types";
import { JOURNAL_FILE, projectJournal } from "../core/store/journal";
import { createJsonlTail, type JsonlTail } from "../core/store/jsonl-tail";
import { cliRunSchema, RUNS_FILE, type CliRun } from "../core/store/runs";

type BaseSlot = "scoped" | "backlog";

type ScopeSources = { journals: ProjectJournal[]; baseOf: (slot: BaseSlot, input: StatsInput) => ReportBase };

type CostReportScope = { usageRevision: number; projectId: string | undefined; now: Date; snapshot: object };

export type StatsSources = {
  read: (snapshot: object, projectIds: readonly string[]) => Promise<ScopeSources>;
  retain: (projectIds: readonly string[]) => void;
  costReport: (scope: CostReportScope, compute: (runs: readonly CliRun[]) => Promise<CostReport>) => Promise<CostReport>;
};

type TailedJournal = { journal: ProjectJournal; position: string };

type RememberedBase = { projectId: string | undefined; snapshot: object; key: string; base: ReportBase };

type RememberedCost = { snapshot: object; key: string; report: Promise<CostReport> };

const ALL_PROJECTS_SLOT = "*";

export function createStatsSources(root: string): StatsSources {
  const tails = new Map<string, JsonlTail<JournalEvent>>();
  const bases = new Map<string, RememberedBase>();
  const runsTail = createJsonlTail<CliRun>(join(root, RUNS_FILE), cliRunSchema);
  const costMemos = new Map<string, RememberedCost>();

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
    const key = `${slotKey}|${positions.join(",")}`;
    const remembered = bases.get(slotKey);
    if (remembered?.snapshot === snapshot && remembered.key === key) return remembered.base;
    const base = reportBase(input);
    bases.set(slotKey, { projectId: input.projectId, snapshot, key, base });
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
    costReport: async ({ usageRevision, projectId, now, snapshot }, compute) => {
      const { values: runs, length, generation } = await runsTail.read();
      const slot = projectId ?? ALL_PROJECTS_SLOT;
      const key = `${usageRevision}|${generation}:${length}|${slot}|${formatLocalDay(now)}`;
      const remembered = costMemos.get(slot);
      if (remembered?.snapshot === snapshot && remembered.key === key) return remembered.report;
      const report = compute(runs);
      costMemos.set(slot, { snapshot, key, report });
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
