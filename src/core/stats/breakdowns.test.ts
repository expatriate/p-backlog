import { describe, expect, it } from "vitest";
import { formatLocalIso } from "../model/dates";
import { makeTask } from "../model/testing/make-task";
import { ageBreakdown, closingBreakdown, folderOf, hotspots } from "./breakdowns";
import type { TaskHistory } from "./history";

const at = (day: number, hour = 12) => new Date(2026, 8, day, hour);

describe("где болит", () => {
  it("папка — путь без строки и имени файла, файл в корне — имя файла", () => {
    expect(folderOf("src/a/b.ts:3")).toBe("src/a");
    expect(folderOf("src/a/b.ts:3:7")).toBe("src/a");
    expect(folderOf("README.md:1")).toBe("README.md");
    expect(folderOf("src/a")).toBe("src");
  });

  it("8 папок и тегов с наибольшим числом задач, при равенстве — по алфавиту; в «Все проекты» — с проектом", () => {
    const tasks = [
      makeTask({ id: "SPA-1", source: "src/a/b.ts:3", tags: ["upload", "tests"] }),
      makeTask({ id: "SPA-2", source: "src/a/c.ts:9", tags: ["upload"] }),
      makeTask({ id: "SPA-3", source: "README.md:1", tags: ["docs"] }),
      makeTask({ id: "SPA-4", tags: [] }),
    ];

    expect(hotspots(tasks, false)).toEqual({
      folders: [
        { label: "src/a", count: 2 },
        { label: "README.md", count: 1 },
      ],
      tags: [
        { tag: "upload", count: 2 },
        { tag: "docs", count: 1 },
        { tag: "tests", count: 1 },
      ],
    });
    expect(hotspots(tasks, true).folders[0]).toEqual({ label: "spa · src/a", count: 2 });
  });
});

describe("возраст открытых", () => {
  it("корзины по приоритетам и критичные с высокими старше 7 дней", () => {
    const now = at(30);
    const tasks = [
      makeTask({ id: "SPA-1", created: formatLocalIso(at(28)), priority: "critical" }),
      makeTask({ id: "SPA-2", created: formatLocalIso(at(20)), priority: "high" }),
      makeTask({ id: "SPA-3", created: formatLocalIso(at(20)), priority: "low" }),
      makeTask({ id: "SPA-4", created: formatLocalIso(new Date(2026, 5, 1)), priority: "medium" }),
    ];

    const age = ageBreakdown(tasks, now);

    expect(age.buckets.map(({ bucket, byPriority }) => [bucket, byPriority])).toEqual([
      ["week", { low: 0, medium: 0, high: 0, critical: 1 }],
      ["month", { low: 1, medium: 0, high: 1, critical: 0 }],
      ["quarter", { low: 0, medium: 0, high: 0, critical: 0 }],
      ["older", { low: 0, medium: 1, high: 0, critical: 0 }],
    ]);
    expect(age.urgentStale).toBe(1);
  });
});

describe("как закрываются", () => {
  it("причины, кто закрыл, шум и возвраты за период", () => {
    const history = (id: string, transitions: TaskHistory["transitions"], source?: string): TaskHistory => ({
      id,
      projectId: "spa",
      type: "task",
      createdAt: at(2).getTime(),
      source,
      transitions,
    });
    const histories = [
      history("SPA-1", [{ at: at(5).getTime(), from: "backlog", to: "done", via: "cli" }], "src/a.ts:1"),
      history("SPA-2", [{ at: at(6).getTime(), from: "backlog", to: "done", resolution: "fixed", via: "check" }], "src/a.ts:2"),
      history("SPA-3", [{ at: at(7).getTime(), from: "backlog", to: "cancelled", resolution: "duplicate", via: "web" }]),
      history("SPA-4", [{ at: at(8).getTime(), to: "cancelled", resolution: "obsolete", via: "unknown" }], "src/b.ts:1"),
      history("SPA-5", [
        { at: at(9).getTime(), from: "backlog", to: "cancelled", via: "cli" },
        { at: at(10).getTime(), from: "cancelled", to: "backlog", via: "web" },
      ]),
    ];

    const closing = closingBreakdown(histories, at(1).getTime(), at(30).getTime());

    expect(closing.byReason).toEqual({ done: 1, fixed: 1, obsolete: 1, duplicate: 1, cancelled: 1 });
    expect(closing.byActor).toEqual({ agent: 3, human: 1, unknown: 1 });
    expect(closing.duplicateShare).toBeCloseTo(0.2);
    expect(closing.withoutSourceShare).toBeCloseTo(0.4);
    expect(closing.reopened).toBe(1);
  });

  it("нет закрытий и созданных — доли пустые", () => {
    expect(closingBreakdown([], 0, 1)).toMatchObject({ duplicateShare: null, withoutSourceShare: null, reopened: 0 });
  });
});
