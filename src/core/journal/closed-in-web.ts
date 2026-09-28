import { isClosed } from "../model/graph";
import type { Task } from "../model/types";
import { isClosingChange, withoutUndoneClosings, type JournalEvent, type ProjectJournal } from "./events";

type StatusEvent = Extract<JournalEvent, { kind: "status" }>;

export function tasksClosedInWeb(tasks: readonly Task[], journals: readonly ProjectJournal[]): string[] {
  const statusEventsOf = new Map<string, StatusEvent[]>();
  for (const { events } of journals) {
    for (const event of events) {
      if (event.kind !== "status") continue;
      const known = statusEventsOf.get(event.task);
      if (known === undefined) statusEventsOf.set(event.task, [event]);
      else known.push(event);
    }
  }
  const lastClosingOf = (id: string) => withoutUndoneClosings([...(statusEventsOf.get(id) ?? [])].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))).findLast(isClosingChange);
  return tasks.filter((task) => isClosed(task.status) && lastClosingOf(task.id)?.via === "web").map((task) => task.id);
}
