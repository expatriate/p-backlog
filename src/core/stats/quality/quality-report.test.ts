import { describe, expect, it } from "vitest";
import { formatLocalIso } from "../../model/dates";
import { makeTask } from "../../model/testing/make-task";
import { qualityReport } from "./quality-report";

const NOW = new Date(2026, 8, 18, 12);
const iso = (day: number) => formatLocalIso(new Date(2026, 8, day, 12));

describe("отчёт «Качество»", () => {
  it("область проекта, эпики не считаются, все блоки собраны", () => {
    const tasks = [
      makeTask({ id: "SPA-1", created: iso(2), category: "bug" }),
      makeTask({ id: "SPA-2", created: iso(2), type: "epic" }),
      makeTask({ id: "TI-1", projectId: "ti", created: iso(2), category: "bug" }),
    ];
    const journals = [{ projectId: "spa", events: [{ at: iso(3), task: "SPA-1", via: "check" as const, kind: "candidate" as const, evidence: "source-changed" as const, mode: "full" as const }], invalidLines: 0 }];

    const report = qualityReport({ tasks, journals, now: NOW, projectId: "spa" });

    expect(report.taskCount).toBe(1);
    expect(report.accuracy.at(-1)).toEqual({ evidence: "total", candidates: 1, closed: 0, verified: 0, open: 1, precision: null });
    expect(report.categories).toEqual([{ category: "bug", open: 1, weight: 2, created: 1, closed: 0 }]);
    expect(report.found.map((row) => row.created)).toEqual([0, 0, 1]);
    expect(report.branches).toEqual([]);
  });
});
