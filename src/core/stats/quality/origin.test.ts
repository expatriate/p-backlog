import { describe, expect, it } from "vitest";
import type { JournalEvent } from "../../journal/events";
import { formatLocalIso } from "../../model/dates";
import { makeTask } from "../../model/testing/make-task";
import { taskHistories } from "../history";
import { branchBreakdown, foundBreakdown } from "./origin";

const at = (day: number, hour = 12) => new Date(2026, 8, day, hour);
const iso = (day: number, hour = 12) => formatLocalIso(at(day, hour));
const FROM = at(1).getTime();
const TO = at(18).getTime();
const journal = (events: JournalEvent[]) => [{ projectId: "spa", events, invalidLines: 0 }];

const created = (task: string, day: number, found?: "review" | "incidental", branch?: string): JournalEvent => ({
  at: iso(day),
  task,
  via: "cli",
  kind: "created",
  type: "task",
  priority: "medium",
  tags: [],
  ...(found === undefined ? {} : { found }),
  ...(branch === undefined ? {} : { origin: { branch, commit: "abc1234" } }),
});

describe("происхождение", () => {
  const tasks = [
    makeTask({ id: "SPA-1", created: iso(2) }),
    makeTask({ id: "SPA-2", created: iso(3), status: "done", closed: iso(5), resolution: "fixed" }),
    makeTask({ id: "SPA-3", created: iso(4), status: "done", closed: iso(6), resolution: "obsolete" }),
    makeTask({ id: "SPA-4", created: iso(4) }),
    makeTask({ id: "SPA-5", created: iso(5) }),
  ];
  const events = [created("SPA-1", 2, "review", "feat/a"), created("SPA-2", 3, "review", "feat/a"), created("SPA-3", 4, "incidental", "feat/b"), created("SPA-4", 4, "incidental")];
  const histories = taskHistories(tasks, journal(events));

  it("как найдены: три строки всегда, открыто и исправлено из созданных в периоде", () => {
    expect(foundBreakdown(histories, FROM, TO)).toEqual([
      { found: "review", created: 2, open: 1, fixed: 1 },
      { found: "incidental", created: 2, open: 1, fixed: 0 },
      { found: null, created: 1, open: 1, fixed: 0 },
    ]);
  });

  it("ветки по убыванию созданных, подпись с проектом во всех проектах", () => {
    expect(branchBreakdown(histories, FROM, TO, false)).toEqual([
      { label: "feat/a", created: 2, open: 1 },
      { label: "feat/b", created: 1, open: 0 },
    ]);
    expect(branchBreakdown(histories, FROM, TO, true)[0]?.label).toBe("spa · feat/a");
  });
});
