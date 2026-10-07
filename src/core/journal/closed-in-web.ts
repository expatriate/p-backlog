import { groupBy } from "../collections";
import { isClosed } from "../model/graph";
import type { Task } from "../model/types";
import { isClosingChange, withoutUndoneClosings, type JournalEvent, type ProjectJournal } from "./events";

type StatusEvent = Extract<JournalEvent, { kind: "status" }>;

export function tasksClosedInWeb(tasks: readonly Task[], journals: readonly ProjectJournal[]): string[] {
  const chronologicalStatusEvents = journals.flatMap(({ events }) => events.filter((event): event is StatusEvent => event.kind === "status")).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const statusEventsOf = groupBy(chronologicalStatusEvents, (event) => event.task);
  const lastClosingOf = (id: string) => withoutUndoneClosings(statusEventsOf.get(id) ?? []).findLast(isClosingChange);
  return tasks.filter((task) => isClosed(task.status) && lastClosingOf(task.id)?.via === "web").map((task) => task.id);
}
