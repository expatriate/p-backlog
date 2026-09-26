import { join } from "node:path";
import { journalEventSchema, type JournalEvent, type ProjectJournal } from "../core/journal/events";
import { reportBase, type ReportBase, type StatsInput } from "../core/stats/scope";
import { JOURNAL_FILE, projectJournal } from "../core/store/journal";
import { createJsonlTail, type JsonlTail } from "../core/store/jsonl-tail";

type BaseSlot = "scoped" | "backlog";

type ScopeSources = { journals: ProjectJournal[]; baseOf: (slot: BaseSlot, input: StatsInput) => ReportBase };

export type StatsSources = {
  read: (snapshot: object, projectIds: readonly string[]) => Promise<ScopeSources>;
  retain: (projectIds: readonly string[]) => void;
};

type TailedJournal = { journal: ProjectJournal; position: string };

type RememberedBase = { projectId: string | undefined; snapshot: object; key: string; base: ReportBase };

export function createStatsSources(root: string): StatsSources {
  const tails = new Map<string, JsonlTail<JournalEvent>>();
  const bases = new Map<string, RememberedBase>();

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
      for (const projectId of tails.keys()) if (!kept.has(projectId)) tails.delete(projectId);
      for (const [slotKey, { projectId }] of bases) if (projectId !== undefined && !kept.has(projectId)) bases.delete(slotKey);
    },
  };
}
