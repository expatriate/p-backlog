import { describe, expect, it } from "vitest";
import type { JournalEvent } from "../../journal/events";
import { formatLocalIso } from "../../model/dates";
import { makeTask } from "../../model/testing/make-task";
import type { TaskStatus } from "../../model/types";
import { taskHistories } from "../history";
import { inWorkTasks } from "./current";

const at = (day: number, hour = 12) => new Date(2026, 8, day, hour);
const iso = (day: number, hour = 12) => formatLocalIso(at(day, hour));
const NOW = at(18);
const status = (task: string, day: number, from: TaskStatus, to: TaskStatus): JournalEvent => ({ at: iso(day), task, via: "cli", kind: "status", from, to });

describe("задачи в работе", () => {
  it("сортирует по времени в текущем статусе, без перехода в журнале — «не меньше» от создания", () => {
    const tasks = [
      makeTask({ id: "SPA-1", created: iso(1), status: "in-progress" }),
      makeTask({ id: "SPA-2", created: iso(5), status: "blocked" }),
      makeTask({ id: "SPA-3", created: iso(2), status: "in-progress" }),
      makeTask({ id: "SPA-4", created: iso(2) }),
    ];
    const events = [status("SPA-1", 10, "backlog", "in-progress"), status("SPA-3", 15, "backlog", "in-progress")];
    const histories = taskHistories(tasks, [{ projectId: "spa", events, invalidLines: 0 }]);

    const inWork = inWorkTasks(tasks, histories, NOW);

    expect(inWork.map(({ id, status: taskStatus, atLeast }) => ({ id, status: taskStatus, atLeast }))).toEqual([
      { id: "SPA-2", status: "blocked", atLeast: true },
      { id: "SPA-1", status: "in-progress", atLeast: false },
      { id: "SPA-3", status: "in-progress", atLeast: false },
    ]);
    expect(inWork[0]?.days).toBeCloseTo(13);
    expect(inWork[1]?.days).toBeCloseTo(8);
  });
});
