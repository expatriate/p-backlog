import { describe, expect, it } from "vitest";
import type { JournalEvent } from "../../journal/events";
import { formatLocalIso } from "../../model/dates";
import { makeTask } from "../../model/testing/make-task";
import type { Task } from "../../model/types";
import { taskHistories, type TaskHistory } from "../history";
import { statusAt } from "./status-at";

const at = (day: number, hour = 12) => new Date(2026, 8, day, hour).getTime();
const iso = (day: number, hour = 12) => formatLocalIso(new Date(at(day, hour)));

function historyOf(task: Task, events: JournalEvent[] = []): TaskHistory {
  const [history] = taskHistories([task], [{ projectId: "spa", events, invalidLines: 0 }]);
  if (!history) throw new Error("нет истории");
  return history;
}

describe("статус задачи в момент", () => {
  it("берёт последний переход не позже момента", () => {
    const history = historyOf(makeTask({ id: "SPA-1", created: iso(1), status: "blocked" }), [
      { at: iso(3), task: "SPA-1", via: "cli", kind: "status", from: "backlog", to: "in-progress" },
      { at: iso(5), task: "SPA-1", via: "web", kind: "status", from: "in-progress", to: "blocked" },
    ]);

    expect(statusAt(history, at(4))).toBe("in-progress");
    expect(statusAt(history, at(6))).toBe("blocked");
  });

  it("до первого перехода — статус, из которого он вышел", () => {
    const history = historyOf(makeTask({ id: "SPA-1", created: iso(1), status: "in-progress" }), [
      { at: iso(3), task: "SPA-1", via: "cli", kind: "status", from: "blocked", to: "in-progress" },
    ]);

    expect(statusAt(history, at(2))).toBe("blocked");
  });

  it("без переходов — статус из файла", () => {
    const history = historyOf(makeTask({ id: "SPA-1", created: iso(1), status: "in-progress" }));

    expect(statusAt(history, at(2))).toBe("in-progress");
  });
});
