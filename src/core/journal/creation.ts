import type { TaskType } from "../model/types";
import type { JournalEvent } from "./events";

type TaskRecord = { created: string; type: TaskType };

type CreatedEvent = Pick<Extract<JournalEvent, { kind: "created" }>, "at" | "type">;

type TaskCreation = { createdAt: number; type: TaskType };

export function taskCreation(record: TaskRecord | undefined, created: CreatedEvent | undefined): TaskCreation | undefined {
  if (record !== undefined) return { createdAt: Date.parse(record.created), type: record.type };
  return created === undefined ? undefined : { createdAt: Date.parse(created.at), type: created.type };
}
