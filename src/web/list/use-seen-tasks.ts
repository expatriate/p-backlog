import { useEffect, useMemo, useSyncExternalStore } from "react";
import { z } from "zod";
import { isClosed } from "../../core/model/graph";
import type { Task } from "../../core/model/types";

export const SEEN_TASKS_STORAGE_KEY = "p-backlog.seen";

const seenRecordSchema = z.object({ since: z.number(), ids: z.array(z.string()) });

type SeenRecord = z.infer<typeof seenRecordSchema>;

export type SeenTasks = { isNew: (task: Task) => boolean };

const listeners = new Set<() => void>();

export function useSeenTasks(tasks: readonly Task[] | undefined, openedTask: Task | undefined): SeenTasks {
  const stored = useSyncExternalStore(subscribe, readStored);
  const record = useMemo(() => parseRecord(stored), [stored]);

  useEffect(() => {
    if (record === undefined) writeRecord({ since: Date.now(), ids: [] });
  }, [record]);

  useEffect(() => {
    const current = parseRecord(readStored());
    if (current === undefined || tasks === undefined) return;
    const existingIds = new Set(tasks.map((task) => task.id));
    const ids = current.ids.filter((id) => existingIds.has(id));
    if (ids.length < current.ids.length) writeRecord({ ...current, ids });
  }, [tasks]);

  useEffect(() => {
    if (openedTask !== undefined) markSeen(openedTask);
  }, [openedTask]);

  return useMemo(() => {
    const seen = new Set(record?.ids);
    const isNew = (task: Task) =>
      record !== undefined && !isClosed(task.status) && createdAfter(task, record) && !seen.has(task.id);
    return { isNew };
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
    return window.localStorage.getItem(SEEN_TASKS_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeRecord(record: SeenRecord): void {
  try {
    window.localStorage.setItem(SEEN_TASKS_STORAGE_KEY, JSON.stringify(record));
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
