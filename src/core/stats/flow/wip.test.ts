import { describe, expect, it } from "vitest";
import type { JournalEvent } from "../../journal/events";
import { formatLocalIso } from "../../model/dates";
import { makeTask } from "../../model/testing/make-task";
import type { TaskStatus } from "../../model/types";
import { taskHistories } from "../history";
import { flowWip } from "./wip";

const at = (day: number, hour = 12) => new Date(2026, 8, day, hour);
const iso = (day: number, hour = 12) => formatLocalIso(at(day, hour));
const NOW = at(18);
const status = (task: string, day: number, from: TaskStatus, to: TaskStatus): JournalEvent => ({ at: iso(day), task, via: "cli", kind: "status", from, to });

describe("в работе одновременно", () => {
  it("максимум за неделю по переходам, недели до журнала пустые", () => {
    const tasks = [
      makeTask({ id: "SPA-1", created: iso(1), status: "done", closed: iso(17) }),
      makeTask({ id: "SPA-2", created: iso(1), status: "in-progress" }),
    ];
    const events = [
      status("SPA-1", 15, "backlog", "in-progress"),
      status("SPA-2", 16, "backlog", "in-progress"),
      status("SPA-1", 17, "in-progress", "done"),
    ];
    const histories = taskHistories(tasks, [{ projectId: "spa", events, invalidLines: 0 }]);

    const weeks = flowWip(histories, NOW, at(15).getTime());

    expect(weeks).toHaveLength(12);
    expect(weeks.slice(0, 11).every((week) => week.max === null)).toBe(true);
    expect(weeks[11]?.max).toBe(2);
  });

  it("без журнала все недели пустые", () => {
    const tasks = [makeTask({ id: "SPA-1", created: iso(1), status: "in-progress" })];

    const weeks = flowWip(taskHistories(tasks, []), NOW, null);

    expect(weeks.every((week) => week.max === null)).toBe(true);
  });

  it("журнал начинается в середине недели — задача уже в работе на этот момент", () => {
    const tasks = [makeTask({ id: "SPA-1", created: iso(-60), status: "blocked" })];
    const events = [status("SPA-1", -25, "in-progress", "blocked")];
    const histories = taskHistories(tasks, [{ projectId: "spa", events, invalidLines: 0 }]);
    const journalStart = at(-26, 9).getTime();

    const weeks = flowWip(histories, NOW, journalStart);

    expect(weeks[4]?.max).toBe(null);
    expect(weeks[5]?.max).toBe(1);
  });

  it("повторный переход «в работу» без выхода не удваивает счёт", () => {
    const tasks = [makeTask({ id: "SPA-1", created: iso(1), status: "in-progress" })];
    const events = [status("SPA-1", 15, "backlog", "in-progress"), status("SPA-1", 16, "blocked", "in-progress")];
    const histories = taskHistories(tasks, [{ projectId: "spa", events, invalidLines: 0 }]);

    const weeks = flowWip(histories, NOW, at(15).getTime());

    expect(weeks[11]?.max).toBe(1);
  });
});
