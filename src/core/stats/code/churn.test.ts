import { describe, expect, it } from "vitest";
import { makeTask } from "../../model/testing/make-task";
import type { ProjectCode } from "../types";
import { churn } from "./churn";

const project = (projectId: string, commits: string[][][]): ProjectCode => ({ projectId, name: projectId, repos: commits.map((repoCommits) => ({ commits: repoCommits, lines: [], units: [] })) });

describe("меняется × долг", () => {
  it("коммит считается один раз на папку, репозитории проекта складываются, балл — коммиты × вес", () => {
    const tasks = [
      makeTask({ id: "SPA-1", source: "src/api/client.ts:10", priority: "high" }),
      makeTask({ id: "SPA-2", source: "src/api/retry.ts:3", priority: "low" }),
      makeTask({ id: "SPA-3", source: "src/ui/button.tsx:1", priority: "critical" }),
      makeTask({ id: "SPA-4", source: "docs/readme.md:1" }),
    ];
    const projects = [
      project("spa", [
        [["src/api/client.ts", "src/api/retry.ts"], ["src/api/client.ts", "src/ui/button.tsx"]],
        [["src/api/other.ts"]],
      ]),
    ];

    expect(churn(tasks, projects, false)).toEqual([
      { label: "src/api", commits: 3, tasks: 2, weight: 5, score: 15 },
      { label: "src/ui", commits: 1, tasks: 1, weight: 8, score: 8 },
    ]);
  });

  it("во всех проектах подпись с проектом, не больше восьми строк", () => {
    const tasks = Array.from({ length: 9 }, (_, index) => makeTask({ id: `SPA-${index + 1}`, source: `d${index}/f.ts:1` }));
    const projects = [project("spa", [tasks.map((_, index) => [`d${index}/f.ts`])])];

    const rows = churn(tasks, projects, true);

    expect(rows).toHaveLength(8);
    expect(rows[0]?.label).toBe("spa · d0");
  });
});
