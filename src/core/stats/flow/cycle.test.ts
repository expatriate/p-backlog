import { describe, expect, it } from "vitest";
import type { JournalEvent } from "../../journal/events";
import { formatLocalIso } from "../../model/dates";
import { makeTask } from "../../model/testing/make-task";
import type { TaskStatus } from "../../model/types";
import { taskHistories } from "../history";
import { flowCycle } from "./cycle";

const at = (day: number, hour = 12) => new Date(2026, 8, day, hour);
const iso = (day: number, hour = 12) => formatLocalIso(at(day, hour));
const NOW = at(18);
const status = (task: string, day: number, from: TaskStatus, to: TaskStatus): JournalEvent => ({ at: iso(day), task, via: "cli", kind: "status", from, to });

describe("время в работе", () => {
  it("от взятия до закрытия, блокировка внутри, закрытие без взятия не входит, возврат — новое взятие", () => {
    const tasks = [
      makeTask({ id: "SPA-1", created: iso(1), status: "done", closed: iso(6) }),
      makeTask({ id: "SPA-2", created: iso(1), status: "done", closed: iso(3) }),
      makeTask({ id: "SPA-3", created: iso(1), status: "done", closed: iso(12) }),
    ];
    const events = [
      status("SPA-1", 2, "backlog", "in-progress"),
      status("SPA-1", 4, "in-progress", "blocked"),
      status("SPA-1", 5, "blocked", "in-progress"),
      status("SPA-1", 6, "in-progress", "done"),
      status("SPA-2", 3, "backlog", "done"),
      status("SPA-3", 7, "backlog", "in-progress"),
      status("SPA-3", 8, "in-progress", "done"),
      status("SPA-3", 9, "done", "backlog"),
      status("SPA-3", 10, "backlog", "in-progress"),
      status("SPA-3", 12, "in-progress", "done"),
    ];
    const histories = taskHistories(tasks, [{ projectId: "spa", events, invalidLines: 0 }]);

    const cycle = flowCycle(histories, at(1).getTime(), NOW.getTime());

    expect(cycle.sample).toBe(3);
    expect(cycle.medianDays).toBeCloseTo(2);
    expect(cycle.p90Days).toBeCloseTo(4);
    expect(cycle.blockedShare).toBeCloseTo(1 / 7);
  });

  it("без закрытий с работой — пусто", () => {
    expect(flowCycle([], at(1).getTime(), NOW.getTime())).toEqual({ medianDays: null, p90Days: null, blockedShare: null, sample: 0 });
  });
});
