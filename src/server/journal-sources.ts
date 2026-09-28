import { join } from "node:path";
import { journalEventSchema, type JournalEvent, type ProjectJournal } from "../core/journal/events";
import { reportContext, type ReportContext, type StatsInput } from "../core/stats/scope";
import { JOURNAL_FILE, projectJournal } from "../core/store/journal";
import { createJsonlTail, type JsonlTail } from "../core/store/jsonl-tail";
import { createSnapshotIds, pruneUnlessKept } from "./source-memos";

type ScopeSources = { journals: ProjectJournal[]; contextOf: (input: StatsInput) => ReportContext };

export type JournalSources = {
  journals: (projectIds: readonly string[]) => Promise<ProjectJournal[]>;
  read: (snapshot: object, projectIds: readonly string[]) => Promise<ScopeSources>;
  retain: (projectIds: readonly string[]) => void;
};

type TailedJournal = { journal: ProjectJournal; position: string };

type RememberedContext = { projectId: string | undefined; key: string; context: ReportContext };

export function createJournalSources(root: string): JournalSources {
  const tails = new Map<string, JsonlTail<JournalEvent>>();
  const contexts = new Map<string, RememberedContext>();
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

  const rememberedContext = (snapshot: object, tailed: readonly TailedJournal[]) => (input: StatsInput): ReportContext => {
    const slotKey = input.projectId ?? "*";
    const positions = tailed.filter(({ journal }) => input.projectId === undefined || journal.projectId === input.projectId).map(({ position }) => position);
    const key = `${snapshotIdOf(snapshot)}|${slotKey}|${positions.join(",")}`;
    const remembered = contexts.get(slotKey);
    if (remembered?.key === key) return { ...remembered.context, input };
    const context = reportContext(input);
    contexts.set(slotKey, { projectId: input.projectId, key, context });
    return context;
  };

  return {
    journals: async (projectIds) => (await Promise.all(projectIds.map(readTailed))).map(({ journal }) => journal),
    read: async (snapshot, projectIds) => {
      const tailed = await Promise.all(projectIds.map(readTailed));
      return { journals: tailed.map(({ journal }) => journal), contextOf: rememberedContext(snapshot, tailed) };
    },
    retain: (projectIds) => {
      const kept = new Set(projectIds);
      pruneUnlessKept(tails, kept, (projectId) => projectId);
      pruneUnlessKept(contexts, kept, (_, { projectId }) => projectId);
    },
  };
}
