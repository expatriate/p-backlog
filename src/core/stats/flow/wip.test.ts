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

    const wip = flowWip(histories, NOW, at(15).getTime());

    expect(wip.weeks).toHaveLength(12);
    expect(wip.weeks.slice(0, 11).every((week) => week.max === null)).toBe(true);
    expect(wip.weeks[11]?.max).toBe(2);
    expect(wip.current).toBe(1);
  });

  it("без журнала все недели пустые, сейчас — по статусам файлов", () => {
    const tasks = [makeTask({ id: "SPA-1", created: iso(1), status: "in-progress" })];

    const wip = flowWip(taskHistories(tasks, []), NOW, null);

    expect(wip.weeks.every((week) => week.max === null)).toBe(true);
    expect(wip.current).toBe(1);
  });
});
