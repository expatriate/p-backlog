import { describe, expect, it } from "vitest";
import type { JournalEvent } from "../../journal/events";
import { formatLocalIso } from "../../model/dates";
import { makeTask } from "../../model/testing/make-task";
import type { TaskStatus } from "../../model/types";
import { taskHistories } from "../history";
import { flowNow } from "./current";

const at = (day: number, hour = 12) => new Date(2026, 8, day, hour);
const iso = (day: number, hour = 12) => formatLocalIso(at(day, hour));
const NOW = at(18);
const status = (task: string, day: number, from: TaskStatus, to: TaskStatus): JournalEvent => ({ at: iso(day), task, via: "cli", kind: "status", from, to });

describe("в работе сейчас", () => {
  it("числа по статусам и самые долгие, без перехода в журнале — «не меньше» от создания", () => {
    const tasks = [
      makeTask({ id: "SPA-1", created: iso(1), status: "in-progress" }),
      makeTask({ id: "SPA-2", created: iso(5), status: "blocked" }),
      makeTask({ id: "SPA-3", created: iso(2), status: "in-progress" }),
      makeTask({ id: "SPA-4", created: iso(2) }),
    ];
    const events = [status("SPA-1", 10, "backlog", "in-progress"), status("SPA-3", 15, "backlog", "in-progress")];
    const histories = taskHistories(tasks, [{ projectId: "spa", events, invalidLines: 0 }]);

    const now = flowNow(tasks, histories, NOW);

    expect(now.inProgress).toBe(2);
    expect(now.blocked).toBe(1);
    expect(now.longest.map(({ id, status: s, atLeast }) => ({ id, status: s, atLeast }))).toEqual([
      { id: "SPA-2", status: "blocked", atLeast: true },
      { id: "SPA-1", status: "in-progress", atLeast: false },
      { id: "SPA-3", status: "in-progress", atLeast: false },
    ]);
    expect(now.longest[0]?.days).toBeCloseTo(13);
    expect(now.longest[1]?.days).toBeCloseTo(8);
  });

  it("список ограничен пятью задачами", () => {
    const tasks = Array.from({ length: 7 }, (_, index) => makeTask({ id: `SPA-${index + 1}`, created: iso(index + 1), status: "in-progress" }));

    const now = flowNow(tasks, taskHistories(tasks, []), NOW);

    expect(now.inProgress).toBe(7);
    expect(now.longest.map((item) => item.id)).toEqual(["SPA-1", "SPA-2", "SPA-3", "SPA-4", "SPA-5"]);
  });
});
