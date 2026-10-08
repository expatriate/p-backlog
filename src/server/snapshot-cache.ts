import { dirname, join } from "node:path";
import type { Revision } from "../core/api/contract";
import { errorText } from "../core/errors";
import { tasksClosedInWeb } from "../core/journal/closed-in-web";
import type { ProjectJournal } from "../core/journal/events";
import { buildIndex, type BacklogIndex } from "../core/model/graph";
import { JOURNAL_FILE } from "../core/store/journal";
import { loadBacklog, type LoadedBacklog } from "../core/store/load";
import type { ChangeFeed } from "./change-feed";
import type { JournalSources } from "./journal-sources";
import type { LocalizedWarn } from "./messages";
import type { OwnWrite, Revisions } from "./revisions";
import { createScopeMemo } from "./source-memos";

export type IndexedBacklog = LoadedBacklog & { index: BacklogIndex; closedInWeb: string[]; revision: Revision };

export type SnapshotCache = { read: () => Promise<IndexedBacklog>; forget: () => void };

type SnapshotCacheOptions = { root: string; revisions: Revisions; journalSources: JournalSources; warn: LocalizedWarn };

export function createSnapshotCache({ root, revisions, journalSources, warn }: SnapshotCacheOptions): SnapshotCache {
  const snapshots = createScopeMemo<Promise<IndexedBacklog>>();
  let generation = 0;
  return {
    read: () => snapshots.get(`${generation}`, () => loadSnapshot(root, revisions.current(), journalSources, warn)),
    forget: () => {
      generation += 1;
    },
  };
}

type DerivedCaches = { forgetAll: () => void; forgetChanged: (paths: readonly string[]) => void };

type RevisionListener = (revision: Revision) => void;

export type ChangeHub = {
  forgetAll: () => void;
  ownWrite: <T>(write: Promise<T>, writtenBy: (result: T) => readonly OwnWrite[]) => Promise<T>;
  onRevision: (listener: RevisionListener) => () => void;
};

type ChangeHubOptions = { revisions: Revisions; snapshots: SnapshotCache; derived: DerivedCaches; changes: ChangeFeed };

export function createChangeHub({ revisions, snapshots, derived, changes }: ChangeHubOptions): ChangeHub {
  const listeners = new Set<RevisionListener>();
  const forgetAll = () => {
    snapshots.forget();
    derived.forgetAll();
  };
  const forgetChanged = (paths: readonly string[]) => {
    snapshots.forget();
    derived.forgetChanged(paths);
  };
  changes.subscribe(async (paths) => {
    if ((await revisions.settle(paths)) === "foreign") forgetChanged(paths);
    else derived.forgetChanged(paths);
    const revision = revisions.current();
    for (const listener of listeners) listener(revision);
  });
  const recordOwnWrites = async (writes: readonly OwnWrite[]): Promise<void> => {
    if (writes.length === 0) return snapshots.forget();
    await revisions.recordOwnWrites(writes, [...new Set(writes.map((write) => join(dirname(write.path), JOURNAL_FILE)))]);
    forgetChanged(writes.map((write) => write.path));
  };
  return {
    forgetAll,
    ownWrite: async (write, writtenBy) => {
      const result = await write.catch((error: unknown) => {
        forgetAll();
        throw error;
      });
      await recordOwnWrites(writtenBy(result));
      return result;
    },
    onRevision: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

async function loadSnapshot(root: string, revision: Revision, journalSources: JournalSources, warn: LocalizedWarn): Promise<IndexedBacklog> {
  const loaded = await loadBacklog(root);
  const projectIds = loaded.projects.map((project) => project.id);
  journalSources.retain(projectIds);
  const readableJournal = (projectId: string): Promise<ProjectJournal> =>
    journalSources.journal(projectId).catch(async (error: unknown) => {
      await warn((messages) => messages.journalReadFailed(join(root, projectId, JOURNAL_FILE), errorText(error)));
      return { projectId, events: [], invalidLines: 0 };
    });
  const journals = await Promise.all(projectIds.map(readableJournal));
  return { ...loaded, index: buildIndex(loaded.tasks), closedInWeb: tasksClosedInWeb(loaded.tasks, journals), revision };
}
