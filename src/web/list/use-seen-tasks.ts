import { useCallback, useEffect, useMemo } from "react";
import { z } from "zod";
import { isOpenTask } from "../app/scope";
import type { Task } from "../../core/model/types";
import { storedJson, useStoredValue } from "../ui/use-stored-value";

export const SEEN_TASKS_STORAGE_KEY = "p-backlog.seen";

const seenRecordSchema = z.object({ since: z.number(), ids: z.array(z.string()) });

const STORED_SEEN_RECORD = storedJson(seenRecordSchema);

type SeenRecord = z.infer<typeof seenRecordSchema>;

export type SeenTasks = { isNew: (task: Task) => boolean; markSeen: (task: Task) => void };

export function useSeenTasks(tasks: readonly Task[] | undefined): SeenTasks {
  const [record, updateRecord] = useStoredValue(SEEN_TASKS_STORAGE_KEY, STORED_SEEN_RECORD);
  const firstVisitRemembered = record !== undefined;

  useEffect(() => {
    if (!firstVisitRemembered) updateRecord((stored) => stored ?? { since: Date.now(), ids: [] });
  }, [firstVisitRemembered, updateRecord]);

  useEffect(() => {
    if (tasks === undefined) return;
    const existingIds = new Set(tasks.map((task) => task.id));
    updateRecord((stored) => stored && withoutDeletedTasks(stored, existingIds));
  }, [tasks, updateRecord]);

  const markSeen = useCallback((task: Task) => updateRecord((stored) => stored && withSeen(stored, task)), [updateRecord]);

  return useMemo(() => {
    const seen = new Set(record?.ids);
    const isNew = (task: Task) => record !== undefined && isOpenTask(task) && createdAfter(task, record) && !seen.has(task.id);
    return { isNew, markSeen };
  }, [record, markSeen]);
}

function withSeen(record: SeenRecord, task: Task): SeenRecord {
  if (!createdAfter(task, record) || record.ids.includes(task.id)) return record;
  return { ...record, ids: [...record.ids, task.id] };
}

function withoutDeletedTasks(record: SeenRecord, existingIds: ReadonlySet<string>): SeenRecord {
  const ids = record.ids.filter((id) => existingIds.has(id));
  return ids.length < record.ids.length ? { ...record, ids } : record;
}

function createdAfter(task: Task, record: SeenRecord): boolean {
  return Date.parse(task.created) > record.since;
}
