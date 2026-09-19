import { describe, expect, it } from "vitest";
import { formatLocalIso } from "../../model/dates";
import { makeTask } from "../../model/testing/make-task";
import type { Task } from "../../model/types";
import { fixKey } from "../code/fixes";
import type { CollectedCode, FixCommit } from "../types";
import { effectReport } from "./effect-report";

const NOW = new Date(2026, 8, 18, 12);
const iso = (month: number, day: number) => formatLocalIso(new Date(2026, month, day, 12));
const fixed = (index: number, lines: number): { task: Task; commit: [string, FixCommit] } => ({
  task: makeTask({ id: `SPA-${index}`, created: iso(8, index), status: "done", closed: iso(8, 10), resolution: "fixed", reason: `Исправлено в aaaaaa${index}`, category: "bug" }),
  commit: [fixKey("spa", `aaaaaa${index}`), { date: iso(8, 10), byAgent: true, lines }],
});
const code = (commits: [string, FixCommit][], units = [{ date: iso(8, 15), lines: 300 }, { date: iso(8, 2), lines: 100 }, { date: iso(5, 1), lines: 999 }]): CollectedCode => ({
  projects: [{ projectId: "spa", name: "Проект spa", repos: [{ commits: [], lines: [], units }] }],
  unavailableRepos: [],
  fixCommits: new Map(commits),
});

describe("эффект беклога", () => {
  const fixes = [10, 20, 30, 40, 50, 60].map((lines, index) => fixed(index + 1, lines));
  const others = [
    makeTask({ id: "SPA-7", created: iso(8, 15), category: "bug" }),
    makeTask({ id: "SPA-8", created: iso(8, 16), category: "bloaters" }),
    makeTask({ id: "SPA-9", created: iso(8, 2), status: "cancelled", closed: iso(8, 3), resolution: "obsolete" }),
    makeTask({ id: "SPA-10", created: iso(8, 2), status: "done", closed: iso(8, 3), resolution: "fixed", reason: "Исправлено без коммита" }),
  ];

  it("исправленные — точно, открытые — по медиане, закрытые без исправления не считаются", () => {
    const report = effectReport({ tasks: [...fixes.map((fix) => fix.task), ...others], journals: [], now: NOW, projectId: "spa", code: code(fixes.map((fix) => fix.commit)) });

    expect(report.totals).toEqual({ realLines: 400, fixedTasks: 6, fixedLines: 210, openTasks: 2, estimatedLines: 70, deferredLines: 280, noiseShare: 280 / 680 });
    expect(report.weeks).toHaveLength(12);
    expect(report.weeks.at(-1)).toMatchObject({ realLines: 300, deferredLines: 70, deferredTasks: 2 });
    expect(report.weeks.at(-3)).toMatchObject({ realLines: 100, deferredLines: 210, deferredTasks: 6 });
    expect(report.projects).toEqual([{ projectId: "spa", name: "Проект spa", realLines: 400, deferredTasks: 8, fixedLines: 210, estimatedLines: 70, noiseShare: 280 / 680 }]);
  });

  it("меньше 5 исправлений — оценки ожидающих нет", () => {
    const few = fixes.slice(0, 4);

    const report = effectReport({ tasks: [...few.map((fix) => fix.task), ...others], journals: [], now: NOW, projectId: "spa", code: code(few.map((fix) => fix.commit)) });

    expect(report.totals).toMatchObject({ fixedTasks: 4, fixedLines: 100, openTasks: 2, estimatedLines: null, deferredLines: 100 });
  });
});
