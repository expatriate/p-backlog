import { describe, expect, it } from "vitest";
import type { JournalEvent } from "../../journal/events";
import { formatLocalIso } from "../../model/dates";
import { makeTask } from "../../model/testing/make-task";
import { taskHistories } from "../history";
import { categoryBreakdown } from "./categories";
import { period } from "../period";

const at = (day: number, hour = 12) => new Date(2026, 8, day, hour);
const iso = (day: number, hour = 12) => formatLocalIso(at(day, hour));
const FROM = at(1).getTime();
const TO = at(18).getTime();
const journal = (events: JournalEvent[]) => [{ projectId: "spa", events, invalidLines: 0 }];

describe("категории", () => {
  it("открыто, вес, создано и закрыто по категориям; удалённая по снимку; «не указана» последней; нулевые не выводятся", () => {
    const tasks = [
      makeTask({ id: "SPA-1", created: iso(2), category: "bloaters", priority: "high" }),
      makeTask({ id: "SPA-2", created: iso(3), category: "bug", priority: "low" }),
      makeTask({ id: "SPA-3", created: iso(3) }),
      makeTask({ id: "SPA-4", created: iso(4), category: "bug", priority: "low" }),
      makeTask({ id: "SPA-5", created: iso(2), category: "bloaters", status: "done", closed: iso(10) }),
    ];
    const deleted: JournalEvent = {
      at: iso(12),
      task: "SPA-6",
      via: "sweep",
      kind: "deleted",
      snapshot: { id: "SPA-6", title: "Удалённая", type: "task", status: "done", priority: "medium", tags: [], blockedBy: [], related: [], created: iso(3), closed: iso(4), category: "couplers" },
    };
    const open = tasks.filter((task) => task.status !== "done");

    expect(categoryBreakdown(open, taskHistories(tasks, journal([deleted])), period(FROM, TO))).toEqual([
      { category: "bloaters", open: 1, weight: 4, created: 2, closed: 1 },
      { category: "bug", open: 2, weight: 2, created: 2, closed: 0 },
      { category: "couplers", open: 0, weight: 0, created: 1, closed: 1 },
      { category: null, open: 1, weight: 2, created: 1, closed: 0 },
    ]);
  });

  it("категория файла главнее события created, даже если файл её убрал", () => {
    const tasks = [makeTask({ id: "SPA-1", created: iso(3) })];
    const events: JournalEvent[] = [
      { at: iso(3), task: "SPA-1", via: "cli", kind: "created", type: "task", priority: "medium", tags: [], category: "bug" },
      { at: iso(5), task: "SPA-1", via: "cli", kind: "category", from: "bug" },
    ];

    expect(categoryBreakdown(tasks, taskHistories(tasks, journal(events)), period(FROM, TO))).toEqual([{ category: null, open: 1, weight: 2, created: 1, closed: 0 }]);
  });

  it("задача только из журнала берёт категорию из последнего события category", () => {
    const events: JournalEvent[] = [
      { at: iso(3), task: "SPA-1", via: "cli", kind: "created", type: "task", priority: "medium", tags: [], category: "bug" },
      { at: iso(5), task: "SPA-1", via: "cli", kind: "category", from: "bug", to: "couplers" },
    ];

    expect(taskHistories([], journal(events))[0]?.category).toBe("couplers");
  });
});
