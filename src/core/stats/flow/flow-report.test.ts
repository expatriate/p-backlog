import { describe, expect, it } from "vitest";
import type { JournalEvent } from "../../journal/events";
import { formatLocalIso } from "../../model/dates";
import { makeTask } from "../../model/testing/make-task";
import type { TaskStatus } from "../../model/types";
import { flowReport } from "./flow-report";

const at = (day: number, hour = 12) => new Date(2026, 8, day, hour);
const iso = (day: number, hour = 12) => formatLocalIso(at(day, hour));
const NOW = at(18);
const status = (task: string, day: number, from: TaskStatus, to: TaskStatus): JournalEvent => ({ at: iso(day), task, via: "cli", kind: "status", from, to });

describe("отчёт потока", () => {
  it("область проекта, эпики не считаются задачами, журнал области", () => {
    const tasks = [
      makeTask({ id: "SPA-1", created: iso(1), status: "in-progress", epic: "SPA-3" }),
      makeTask({ id: "SPA-2", created: iso(2) }),
      makeTask({ id: "SPA-3", created: iso(1), type: "epic" }),
      makeTask({ id: "TI-1", projectId: "ti", created: iso(3), status: "in-progress" }),
    ];
    const journals = [
      { projectId: "spa", events: [status("SPA-1", 16, "backlog", "in-progress")], invalidLines: 1 },
      { projectId: "ti", events: [status("TI-1", 10, "backlog", "in-progress")], invalidLines: 0 },
    ];

    const report = flowReport({ tasks, journals, now: NOW, projectId: "spa" });

    expect(report.taskCount).toBe(2);
    expect(report.journalSince).toBe(iso(16));
    expect(report.invalidJournalLines).toBe(1);
    expect(report.now.inProgress).toBe(1);
    expect(report.wip.current).toBe(1);
    expect(report.forecast.open).toBe(2);
    expect(report.epics.map((epic) => epic.id)).toEqual(["SPA-3"]);
  });

  it("«в работе сейчас» — одно число, даже если файл разошёлся с журналом", () => {
    const tasks = [makeTask({ id: "SPA-1", created: iso(1), status: "in-progress" })];
    const journals = [{ projectId: "spa", events: [status("SPA-1", 15, "backlog", "in-progress"), status("SPA-1", 16, "in-progress", "backlog")], invalidLines: 0 }];

    const report = flowReport({ tasks, journals, now: NOW, projectId: "spa" });

    expect(report.now.inProgress).toBe(1);
    expect(report.wip.current).toBe(report.now.inProgress);
  });
});
