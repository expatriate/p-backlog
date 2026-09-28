import { isClosed } from "../model/graph";
import type { Task } from "../model/types";
import type { ChangeSource, ProjectJournal, Recorded } from "./events";

export function tasksClosedInWeb(tasks: readonly Task[], journals: readonly ProjectJournal[]): string[] {
  const lastCloserOf = new Map<string, Recorded<ChangeSource>>();
  for (const { events } of journals) {
    for (const event of events) if (event.kind === "status" && isClosed(event.to) && !isClosed(event.from)) lastCloserOf.set(event.task, event.via);
  }
  return tasks.filter((task) => isClosed(task.status) && lastCloserOf.get(task.id) === "web").map((task) => task.id);
}
