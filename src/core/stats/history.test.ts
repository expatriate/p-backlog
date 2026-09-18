import { describe, expect, it } from "vitest";
import type { JournalEvent } from "../journal/events";
import { formatLocalIso } from "../model/dates";
import { makeTask } from "../model/testing/make-task";
import type { ProjectJournal } from "../store/journal";
import { closingsOf, isOpenAt, reopeningsOf, taskHistories } from "./history";

const at = (day: number, hour = 12) => new Date(2026, 8, day, hour);
const iso = (day: number, hour = 12) => formatLocalIso(at(day, hour));
const journal = (events: JournalEvent[]): ProjectJournal[] => [{ projectId: "spa", events, invalidLines: 0 }];

describe("история задачи", () => {
  it("закрытие без журнала восстанавливается из файла с источником «неизвестно»", () => {
    const task = makeTask({ id: "SPA-1", created: iso(1), status: "done", closed: iso(5), resolution: "fixed" });

    const [history] = taskHistories([task], journal([]));

    expect(history).toMatchObject({ id: "SPA-1", createdAt: at(1).getTime(), transitions: [{ at: at(5).getTime(), to: "done", resolution: "fixed", via: "unknown" }] });
  });

  it("журнал даёт переходы, возврат делает задачу снова открытой", () => {
    const task = makeTask({ id: "SPA-1", created: iso(1), status: "backlog" });
    const events: JournalEvent[] = [
      { at: iso(3), task: "SPA-1", via: "cli", kind: "status", from: "backlog", to: "done" },
      { at: iso(6), task: "SPA-1", via: "web", kind: "status", from: "done", to: "backlog" },
    ];

    const [history] = taskHistories([task], journal(events));
    if (!history) throw new Error("нет истории");

    expect(isOpenAt(history, at(2).getTime())).toBe(true);
    expect(isOpenAt(history, at(4).getTime())).toBe(false);
    expect(isOpenAt(history, at(7).getTime())).toBe(true);
    expect(closingsOf(history)).toHaveLength(1);
    expect(reopeningsOf(history)).toMatchObject([{ from: "done", to: "backlog", via: "web" }]);
  });

  it("удалённая задача берётся из снимка", () => {
    const removed = makeTask({ id: "SPA-2", created: iso(1), status: "cancelled", closed: iso(2), resolution: "duplicate", source: "src/a.ts:1" });
    const events: JournalEvent[] = [
      {
        at: iso(9),
        task: "SPA-2",
        via: "sweep",
        kind: "deleted",
        snapshot: { id: "SPA-2", title: "x", type: "task", status: "cancelled", priority: "low", tags: [], blockedBy: [], related: [], created: iso(1), closed: iso(2), resolution: "duplicate", source: "src/a.ts:1" },
      },
    ];

    const [history] = taskHistories([], journal(events));

    expect(history).toMatchObject({ id: removed.id, projectId: "spa", createdAt: at(1).getTime(), source: "src/a.ts:1", transitions: [{ to: "cancelled", resolution: "duplicate", via: "unknown" }] });
  });

  it("задача ещё не создана — не открыта", () => {
    const [history] = taskHistories([makeTask({ id: "SPA-1", created: iso(5) })], journal([]));
    if (!history) throw new Error("нет истории");

    expect(isOpenAt(history, at(4).getTime())).toBe(false);
  });
});
