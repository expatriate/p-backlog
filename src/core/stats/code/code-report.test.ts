import { describe, expect, it } from "vitest";
import { formatLocalIso } from "../../model/dates";
import { makeTask } from "../../model/testing/make-task";
import { reportBase } from "../scope";
import { codeReport } from "./code-report";
import { fixRequests } from "./fixes";

const NOW = new Date(2026, 8, 18, 12);
const iso = (day: number) => formatLocalIso(new Date(2026, 8, day, 12));

describe("отчёт «Код»", () => {
  it("область проекта, эпики и закрытые не в долге, недоступные репозитории насквозь", () => {
    const tasks = [
      makeTask({ id: "SPA-1", source: "src/a.ts:1", priority: "high" }),
      makeTask({ id: "SPA-2", source: "src/b.ts:1", type: "epic" }),
      makeTask({ id: "SPA-3", source: "src/c.ts:1", status: "done", closed: iso(10), resolution: "fixed", reason: "Исправлено в abcdef1" }),
      makeTask({ id: "TI-1", projectId: "ti", source: "src/a.ts:1" }),
    ];
    const code = {
      projects: [
        { projectId: "spa", name: "spa", repos: [{ commits: [["src/a.ts"]], lines: [{ path: "src/a.ts", lines: 2000 }], units: [] }] },
        { projectId: "ti", name: "ti", repos: [{ commits: [["src/a.ts"]], lines: [{ path: "src/a.ts", lines: 10 }], units: [] }] },
      ],
      unavailableRepos: ["/nope"],
    };

    const report = codeReport({ tasks, journals: [], now: NOW, projectId: "spa", code });

    expect(report.taskCount).toBe(2);
    expect(report.unavailableRepos).toEqual(["/nope"]);
    expect(report.churn).toEqual([{ label: "src", commits: 1, tasks: 1, weight: 4, score: 4 }]);
    expect(report.density.projects).toEqual([{ projectId: "spa", name: "spa", lines: 2000, open: 1, perKloc: 0.5 }]);
    expect(fixRequests(reportBase({ tasks, journals: [], now: NOW, projectId: "spa" }).histories, NOW)).toEqual([{ projectId: "spa", hashes: ["abcdef1"] }]);
  });

  it("подпись окна оборота охватывает ровно 90 календарных дней, а не 91", () => {
    const report = codeReport({ tasks: [], journals: [], now: NOW, code: { projects: [], unavailableRepos: [] } });

    expect(report.periods.churn).toEqual({ from: formatLocalIso(new Date(2026, 5, 21)), to: formatLocalIso(NOW) });
  });
});
