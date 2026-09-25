import { useEffect, useMemo, useSyncExternalStore } from "react";
import { z } from "zod";
import { OPEN_STATUSES } from "../../core/model/query";
import type { Task } from "../../core/model/types";

const STORAGE_KEY = "p-backlog.seen";

const seenRecordSchema = z.object({ since: z.number(), ids: z.array(z.string()) });

type SeenRecord = z.infer<typeof seenRecordSchema>;

export type SeenTasks = { isNew: (task: Task) => boolean; markSeen: (task: Task) => void };

const listeners = new Set<() => void>();

export function useSeenTasks(tasks: readonly Task[] | undefined): SeenTasks {
  const stored = useSyncExternalStore(subscribe, readStored);
  const record = useMemo(() => parseRecord(stored), [stored]);

  useEffect(() => {
    if (record === undefined) writeRecord({ since: Date.now(), ids: [] });
  }, [record]);

  useEffect(() => {
    if (record === undefined || tasks === undefined) return;
    const existingIds = new Set(tasks.map((task) => task.id));
    const ids = record.ids.filter((id) => existingIds.has(id));
    if (ids.length < record.ids.length) writeRecord({ ...record, ids });
  }, [record, tasks]);

  return useMemo(() => {
    const seen = new Set(record?.ids);
    const isNew = (task: Task) =>
      record !== undefined && OPEN_STATUSES.includes(task.status) && createdAfter(task, record) && !seen.has(task.id);
    return { isNew, markSeen };
  }, [record]);
}

function markSeen(task: Task): void {
  const record = parseRecord(readStored());
  if (record === undefined || !createdAfter(task, record) || record.ids.includes(task.id)) return;
  writeRecord({ ...record, ids: [...record.ids, task.id] });
}

function createdAfter(task: Task, record: SeenRecord): boolean {
  return Date.parse(task.created) > record.since;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeRecord(record: SeenRecord): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    return;
  }
  listeners.forEach((listener) => listener());
}

function parseRecord(stored: string | null): SeenRecord | undefined {
  if (stored === null) return undefined;
  try {
    const parsed = seenRecordSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
