import { describe, expect, it } from "vitest";
import { makeTask } from "../../model/testing/make-task";
import type { ProjectCode } from "../types";
import { density } from "./density";

const project = (projectId: string, lines: Record<string, number>): ProjectCode => ({
  projectId,
  name: `Проект ${projectId}`,
  repos: [{ commits: [], lines: Object.entries(lines).map(([path, count]) => ({ path, lines: count })) }],
});

describe("плотность долга", () => {
  it("все проекты: задачи на 1000 строк по убыванию, проекты без репозиториев не входят, папок нет", () => {
    const tasks = [makeTask({ id: "SPA-1" }), makeTask({ id: "SPA-2" }), makeTask({ id: "TI-1", projectId: "ti" })];
    const projects = [project("spa", { "src/a.ts": 1000 }), project("ti", { "src/b.ts": 250 }), project("empty", {}), { projectId: "none", name: "none", repos: [] }];

    expect(density(tasks, projects, undefined)).toEqual({
      projects: [
        { projectId: "ti", name: "Проект ti", lines: 250, open: 1, perKloc: 4 },
        { projectId: "spa", name: "Проект spa", lines: 1000, open: 2, perKloc: 2 },
        { projectId: "empty", name: "Проект empty", lines: 0, open: 0, perKloc: null },
      ],
      folders: [],
    });
  });

  it("проект: папки от 500 строк с задачами, по убыванию плотности", () => {
    const tasks = [
      makeTask({ id: "SPA-1", source: "src/api/a.ts:1" }),
      makeTask({ id: "SPA-2", source: "src/ui/b.tsx:1" }),
      makeTask({ id: "SPA-3", source: "src/ui/c.tsx:1" }),
      makeTask({ id: "SPA-4", source: "tiny/d.ts:1" }),
    ];
    const projects = [project("spa", { "src/api/a.ts": 800, "src/api/x.ts": 200, "src/ui/b.tsx": 500, "tiny/d.ts": 100, "lib/e.ts": 900 })];

    const result = density(tasks, projects, "spa");

    expect(result.projects).toEqual([{ projectId: "spa", name: "Проект spa", lines: 2500, open: 4, perKloc: 1.6 }]);
    expect(result.folders).toEqual([
      { label: "src/ui", lines: 500, open: 2, perKloc: 4 },
      { label: "src/api", lines: 1000, open: 1, perKloc: 1 },
    ]);
  });
});
