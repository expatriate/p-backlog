import { describe, expect, it } from "vitest";
import type { JournalEvent } from "../journal/events";
import { formatLocalIso } from "../model/dates";
import { makeTask } from "../model/testing/make-task";
import { statsReport } from "./report";

const at = (day: number, hour = 12) => new Date(2026, 8, day, hour);
const NOW = at(18);

describe("отчёт статистики", () => {
  const tasks = [
    makeTask({ id: "SPA-1", created: formatLocalIso(at(1)), priority: "high", source: "src/a.ts:1" }),
    makeTask({ id: "SPA-2", created: formatLocalIso(at(14)), priority: "low" }),
    makeTask({ id: "SPA-3", created: formatLocalIso(at(10)), status: "done", closed: formatLocalIso(at(12)) }),
    makeTask({ id: "SPA-4", created: formatLocalIso(at(10)), type: "epic" }),
    makeTask({ id: "TI-1", projectId: "ti", created: formatLocalIso(at(15)), priority: "critical" }),
  ];
  const journals = [
    { projectId: "spa", events: [{ at: formatLocalIso(at(16)), task: "SPA-2", via: "cli", kind: "priority", from: "medium", to: "low" }] as JournalEvent[], invalidLines: 2 },
    { projectId: "ti", events: [], invalidLines: 0 },
  ];

  it("числа сверху по проекту: открытые без эпиков, вес, неделя, возраст и время до закрытия", () => {
    const report = statsReport({ tasks, journals, now: NOW, projectId: "spa" });

    expect(report.taskCount).toBe(3);
    expect(report.totals).toMatchObject({ open: 2, openWeight: 5, createdLastWeek: 1, closedLastWeek: 1, olderThan30Days: 0 });
    expect(report.totals.ageMedianDays).toBeCloseTo((17 + 4) / 2);
    expect(report.totals.leadTimeMedianDays).toBeCloseTo(2);
    expect(report.totals.leadTimeP90Days).toBeCloseTo(2);
    expect(report.weeks).toHaveLength(12);
    expect(report.journalSince).toBe(formatLocalIso(at(16)));
    expect(report.invalidJournalLines).toBe(2);
  });

  it("все проекты: задачи обоих проектов, папки с именем проекта", () => {
    const report = statsReport({ tasks, journals, now: NOW });

    expect(report.totals.open).toBe(3);
    expect(report.totals.openWeight).toBe(13);
    expect(report.hotspots.folders).toEqual([{ label: "spa · src", count: 1 }]);
  });

  it("закрытие в закрытие не удваивает «закрыто за неделю»", () => {
    const task = makeTask({ id: "SPA-5", created: formatLocalIso(at(1)), status: "cancelled", closed: formatLocalIso(at(16)) });
    const events: JournalEvent[] = [
      { at: formatLocalIso(at(15)), task: "SPA-5", via: "cli", kind: "status", from: "backlog", to: "done" },
      { at: formatLocalIso(at(16)), task: "SPA-5", via: "web", kind: "status", from: "done", to: "cancelled" },
    ];

    const report = statsReport({ tasks: [task], journals: [{ projectId: "spa", events, invalidLines: 0 }], now: NOW, projectId: "spa" });

    expect(report.totals.closedLastWeek).toBe(1);
  });

  it("удалённая задача, известная только по снимку, попадает в закрытые и в причины", () => {
    const events: JournalEvent[] = [
      {
        at: formatLocalIso(at(19)),
        task: "SPA-9",
        via: "sweep",
        kind: "deleted",
        snapshot: {
          id: "SPA-9",
          title: "Пропала",
          type: "task",
          status: "done",
          priority: "medium",
          tags: [],
          blockedBy: [],
          related: [],
          created: formatLocalIso(at(10)),
          closed: formatLocalIso(at(12)),
          resolution: "fixed",
        },
      },
    ];

    const report = statsReport({ tasks: [], journals: [{ projectId: "spa", events, invalidLines: 0 }], now: NOW, projectId: "spa" });

    expect(report.totals.createdLastWeek).toBe(0);
    expect(report.totals.closedLastWeek).toBe(1);
    expect(report.totals.leadTimeMedianDays).toBeCloseTo(2);
    expect(report.closing.byReason.fixed).toBe(1);
  });

  it("задача с неразобранным файлом не считается закрытой и отмечается в шапке отчёта", () => {
    const events: JournalEvent[] = [
      { at: formatLocalIso(at(16)), task: "SPA-7", via: "cli", kind: "created", type: "task", priority: "medium", tags: [] },
      { at: formatLocalIso(at(17)), task: "SPA-7", via: "cli", kind: "status", from: "backlog", to: "in-progress" },
    ];

    const report = statsReport({
      tasks: [],
      journals: [{ projectId: "spa", events, invalidLines: 0 }],
      now: at(17, 18),
      projectId: "spa",
      unparsedTasks: [{ projectId: "spa", id: "SPA-7" }, { projectId: "ti", id: "TI-3" }],
    });

    expect(report.unparsedTasks).toBe(1);
    expect(report.totals).toMatchObject({ open: 1, openWeight: 2, closedToday: 0, closedLastWeek: 0 });
    expect(report.closing.byReason.cancelled).toBe(0);
    expect(report.weeks.at(-1)).toMatchObject({ closed: 0, openAtEnd: 1 });
  });

  it("пустая область — ноль задач и пустые медианы", () => {
    const report = statsReport({ tasks: [], journals: [], now: NOW });

    expect(report.taskCount).toBe(0);
    expect(report.totals).toMatchObject({ open: 0, ageMedianDays: null, leadTimeMedianDays: null });
    expect(report.journalSince).toBeNull();
  });

  it("прошлая неделя: открытые, перевес, медианы возраста и времени до закрытия; без журнала за тот период — null", () => {
    const week = 7 * 24 * 60 * 60 * 1000;
    const weekAgo = new Date(NOW.getTime() - week);
    const older = [
      makeTask({ id: "SPA-10", created: formatLocalIso(at(2)) }),
      makeTask({ id: "SPA-11", created: formatLocalIso(at(4)), status: "done", closed: formatLocalIso(at(8)) }),
      makeTask({ id: "SPA-12", created: formatLocalIso(at(16)) }),
    ];
    const events: JournalEvent[] = [
      { at: formatLocalIso(at(2)), task: "SPA-10", via: "cli", kind: "created", type: "task", priority: "medium", tags: [] },
      { at: formatLocalIso(at(4)), task: "SPA-11", via: "cli", kind: "created", type: "task", priority: "medium", tags: [] },
      { at: formatLocalIso(at(8)), task: "SPA-11", via: "cli", kind: "status", from: "backlog", to: "done", resolution: "fixed" },
      { at: formatLocalIso(at(16)), task: "SPA-12", via: "cli", kind: "created", type: "task", priority: "medium", tags: [] },
    ];
    const journalsWithHistory = [{ projectId: "spa", events, invalidLines: 0 }];

    const previous = statsReport({ tasks: older, journals: journalsWithHistory, now: NOW, projectId: "spa" }).totals.previous;

    expect(previous).toEqual({
      open: 1,
      net: -1,
      ageMedianDays: (weekAgo.getTime() - at(2).getTime()) / (24 * 60 * 60 * 1000),
      leadTimeMedianDays: 4,
    });
    expect(statsReport({ tasks: older, journals: [{ projectId: "spa", events: events.slice(3), invalidLines: 0 }], now: NOW, projectId: "spa" }).totals.previous).toBeNull();
  });
});

describe("заведённые задачи по дням", () => {
  const dayTasks = [
    makeTask({ id: "SPA-1", created: formatLocalIso(at(18, 9)) }),
    makeTask({ id: "SPA-2", created: formatLocalIso(at(18, 23)) }),
    makeTask({ id: "SPA-3", created: formatLocalIso(at(17)) }),
    makeTask({ id: "SPA-4", created: formatLocalIso(at(18)), type: "epic" }),
    makeTask({ id: "TI-1", projectId: "ti", created: formatLocalIso(at(18)) }),
  ];
  const empty = [
    { projectId: "spa", events: [] as JournalEvent[], invalidLines: 0 },
    { projectId: "ti", events: [] as JournalEvent[], invalidLines: 0 },
  ];

  it("последний день — сегодняшний, дни без задач остаются нулями", () => {
    const report = statsReport({ tasks: dayTasks, journals: empty, now: NOW, projectId: "spa" });

    expect(report.days).toHaveLength(30);
    expect(report.days.at(-1)).toEqual({ day: "2026-09-18", created: 2 });
    expect(report.days.at(-2)).toEqual({ day: "2026-09-17", created: 1 });
    expect(report.days.at(-3)).toEqual({ day: "2026-09-16", created: 0 });
  });

  it("задачи за сегодня: заведено и закрыто, только по выбранной области", () => {
    const closedToday = [
      ...dayTasks,
      makeTask({ id: "SPA-5", created: formatLocalIso(at(10)), status: "done", closed: formatLocalIso(at(18, 15)) }),
      makeTask({ id: "SPA-6", created: formatLocalIso(at(10)), status: "done", closed: formatLocalIso(at(17)) }),
      makeTask({ id: "TI-2", projectId: "ti", created: formatLocalIso(at(10)), status: "done", closed: formatLocalIso(at(18)) }),
    ];
    const own = statsReport({ tasks: closedToday, journals: empty, now: NOW, projectId: "spa" });
    const all = statsReport({ tasks: closedToday, journals: empty, now: NOW });

    expect(own.totals).toMatchObject({ createdToday: 2, closedToday: 1 });
    expect(all.totals).toMatchObject({ createdToday: 3, closedToday: 2 });
  });
});
