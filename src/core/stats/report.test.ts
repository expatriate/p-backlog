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

  it("пустая область — ноль задач и пустые медианы", () => {
    const report = statsReport({ tasks: [], journals: [], now: NOW });

    expect(report.taskCount).toBe(0);
    expect(report.totals).toMatchObject({ open: 0, ageMedianDays: null, leadTimeMedianDays: null });
    expect(report.journalSince).toBeNull();
  });
});
