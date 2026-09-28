import { join } from "node:path";
import { journalEventSchema, type JournalEvent, type ProjectJournal } from "../core/journal/events";
import { reportBase, type ReportBase, type StatsInput } from "../core/stats/scope";
import { JOURNAL_FILE, projectJournal } from "../core/store/journal";
import { createJsonlTail, type JsonlTail } from "../core/store/jsonl-tail";
import { createSnapshotIds, pruneUnlessKept } from "./source-memos";

type ScopeSources = { journals: ProjectJournal[]; baseOf: (input: StatsInput) => ReportBase };

export type JournalSources = {
  journals: (projectIds: readonly string[]) => Promise<ProjectJournal[]>;
  read: (snapshot: object, projectIds: readonly string[]) => Promise<ScopeSources>;
  retain: (projectIds: readonly string[]) => void;
};

type TailedJournal = { journal: ProjectJournal; position: string };

type RememberedBase = { projectId: string | undefined; key: string; base: ReportBase };

export function createJournalSources(root: string): JournalSources {
  const tails = new Map<string, JsonlTail<JournalEvent>>();
  const bases = new Map<string, RememberedBase>();
  const snapshotIdOf = createSnapshotIds();

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

  const rememberedBase = (snapshot: object, tailed: readonly TailedJournal[]) => (input: StatsInput) => {
    const slotKey = input.projectId ?? "*";
    const positions = tailed.filter(({ journal }) => input.projectId === undefined || journal.projectId === input.projectId).map(({ position }) => position);
    const key = `${snapshotIdOf(snapshot)}|${slotKey}|${positions.join(",")}`;
    const remembered = bases.get(slotKey);
    if (remembered?.key === key) return remembered.base;
    const base = reportBase(input);
    bases.set(slotKey, { projectId: input.projectId, key, base });
    return base;
  };

  return {
    journals: async (projectIds) => (await Promise.all(projectIds.map(readTailed))).map(({ journal }) => journal),
    read: async (snapshot, projectIds) => {
      const tailed = await Promise.all(projectIds.map(readTailed));
      return { journals: tailed.map(({ journal }) => journal), baseOf: rememberedBase(snapshot, tailed) };
    },
    retain: (projectIds) => {
      const kept = new Set(projectIds);
      pruneUnlessKept(tails, kept, (projectId) => projectId);
      pruneUnlessKept(bases, kept, (_, { projectId }) => projectId);
    },
  };
}
