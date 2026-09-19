import { describe, expect, it } from "vitest";
import type { JournalEvent, ProjectJournal } from "../journal/events";
import { formatLocalIso } from "../model/dates";
import { makeTask } from "../model/testing/make-task";
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

  it("закрытие в закрытие — не новое закрытие", () => {
    const task = makeTask({ id: "SPA-1", created: iso(1), status: "cancelled" });
    const events: JournalEvent[] = [
      { at: iso(3), task: "SPA-1", via: "cli", kind: "status", from: "backlog", to: "done" },
      { at: iso(4), task: "SPA-1", via: "web", kind: "status", from: "done", to: "cancelled" },
    ];

    const [history] = taskHistories([task], journal(events));
    if (!history) throw new Error("нет истории");

    expect(closingsOf(history)).toMatchObject([{ at: at(3).getTime(), to: "done" }]);
    expect(isOpenAt(history, at(5).getTime())).toBe(false);
  });

  it("возврат из закрытого статуса, случившегося до начала журнала", () => {
    const task = makeTask({ id: "SPA-1", created: iso(1), status: "backlog" });
    const events: JournalEvent[] = [{ at: iso(6), task: "SPA-1", via: "cli", kind: "status", from: "done", to: "backlog" }];

    const [history] = taskHistories([task], journal(events));
    if (!history) throw new Error("нет истории");

    expect(isOpenAt(history, at(4).getTime())).toBe(false);
    expect(isOpenAt(history, at(7).getTime())).toBe(true);
  });

  it("файл удалён мимо CLI — задача не остаётся открытой навсегда", () => {
    const events: JournalEvent[] = [{ at: iso(1), task: "SPA-1", via: "cli", kind: "created", type: "task", priority: "medium", tags: [] }];

    const [history] = taskHistories([], journal(events));

    expect(history?.finalStatus).toBe("cancelled");
    expect(isOpenAt(history as never, at(5).getTime())).toBe(false);
  });

  it("файл закрыт правкой без даты закрытия — закрытие по последнему известному переходу", () => {
    const task = makeTask({ id: "SPA-1", created: iso(1), status: "done", resolution: "fixed" });
    const events: JournalEvent[] = [
      { at: iso(1), task: "SPA-1", via: "cli", kind: "created", type: "task", priority: "medium", tags: [] },
      { at: iso(2), task: "SPA-1", via: "cli", kind: "status", from: "backlog", to: "in-progress" },
    ];

    const [history] = taskHistories([task], journal(events));

    expect(closingsOf(history ?? { transitions: [] } as never)).toMatchObject([{ to: "done", via: "unknown" }]);
    expect(isOpenAt(history as never, at(5).getTime())).toBe(false);
  });

  it("файл открыт правкой после закрытия — задача снова открыта", () => {
    const task = makeTask({ id: "SPA-1", created: iso(1), status: "backlog" });
    const events: JournalEvent[] = [
      { at: iso(1), task: "SPA-1", via: "cli", kind: "created", type: "task", priority: "medium", tags: [] },
      { at: iso(2), task: "SPA-1", via: "cli", kind: "status", from: "backlog", to: "done", resolution: "fixed" },
    ];

    const [history] = taskHistories([task], journal(events));

    expect(reopeningsOf(history as never)).toMatchObject([{ to: "backlog", via: "unknown" }]);
    expect(isOpenAt(history as never, at(5).getTime())).toBe(true);
  });
});
