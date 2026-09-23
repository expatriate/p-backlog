import { describe, expect, it } from "vitest";
import type { JournalEvent } from "../journal/events";
import { formatLocalIso } from "../model/dates";
import { makeTask } from "../model/testing/make-task";
import { taskHistories } from "./history";
import { weeklyFlow } from "./weeks";

const at = (month: number, day: number, hour = 12) => new Date(2026, month, day, hour);
const NOW = at(8, 18);

describe("недели", () => {
  it("12 недель с понедельника, последняя — текущая", () => {
    const starts = weeklyFlow([], NOW).map((week) => week.start);

    expect(starts).toHaveLength(12);
    expect(starts.at(-1)).toBe(formatLocalIso(new Date(2026, 8, 14)));
    expect(starts[0]).toBe(formatLocalIso(new Date(2026, 5, 29)));
  });

  it("создано, закрыто и открыто на конец недели", () => {
    const tasks = [
      makeTask({ id: "SPA-1", created: formatLocalIso(at(8, 8)), status: "done", closed: formatLocalIso(at(8, 15)) }),
      makeTask({ id: "SPA-2", created: formatLocalIso(at(8, 15)) }),
    ];
    const events: JournalEvent[] = [];

    const weeks = weeklyFlow(taskHistories(tasks, [{ projectId: "spa", events, invalidLines: 0 }]), NOW);

    expect(weeks.slice(-2)).toEqual([
      { start: formatLocalIso(new Date(2026, 8, 7)), created: 1, closed: 0, openAtEnd: 1 },
      { start: formatLocalIso(new Date(2026, 8, 14)), created: 1, closed: 1, openAtEnd: 1 },
    ]);
  });

  it("возврат в другую неделю: закрытие считается в своей неделе, потом задача снова открыта", () => {
    const task = makeTask({ id: "SPA-1", created: formatLocalIso(at(7, 25)), status: "backlog" });
    const events: JournalEvent[] = [
      { at: formatLocalIso(at(8, 2)), task: "SPA-1", via: "cli", kind: "status", from: "backlog", to: "done" },
      { at: formatLocalIso(at(8, 10)), task: "SPA-1", via: "web", kind: "status", from: "done", to: "backlog" },
    ];

    const weeks = weeklyFlow(taskHistories([task], [{ projectId: "spa", events, invalidLines: 0 }]), NOW);
    const weekOf = (start: Date) => weeks.find((week) => week.start === formatLocalIso(start));

    expect(weekOf(new Date(2026, 7, 31))).toMatchObject({ closed: 1, openAtEnd: 0 });
    expect(weekOf(new Date(2026, 8, 7))).toMatchObject({ openAtEnd: 1 });
  });
});
