import { describe, expect, it } from "vitest";
import { makeTask } from "../model/testing/make-task";
import { tasksClosedInWeb } from "./closed-in-web";
import type { JournalEvent } from "./events";

describe("tasksClosedInWeb", () => {
  it("решает последнее закрытие: задачу, закрытую в вебе, открытую снова и закрытую агентом, веб не присваивает", () => {
    const closed = { status: "done" as const, closed: "2026-09-14T10:00:00+03:00", resolution: "fixed" as const, reason: "есть" };
    const tasks = [makeTask({ id: "SPA-1", ...closed }), makeTask({ id: "SPA-2", ...closed })];
    const events: JournalEvent[] = [
      { at: "2026-09-10T10:00:00+03:00", task: "SPA-1", via: "web", kind: "status", from: "backlog", to: "cancelled", resolution: "obsolete" },
      { at: "2026-09-11T10:00:00+03:00", task: "SPA-1", via: "web", kind: "status", from: "cancelled", to: "backlog", undo: true },
      { at: "2026-09-12T10:00:00+03:00", task: "SPA-1", via: "cli", kind: "status", from: "backlog", to: "done", resolution: "fixed" },
      { at: "2026-09-13T10:00:00+03:00", task: "SPA-2", via: "web", kind: "status", from: "backlog", to: "cancelled", resolution: "obsolete" },
    ];

    expect(tasksClosedInWeb(tasks, [{ projectId: "spa", events, invalidLines: 0 }])).toEqual(["SPA-2"]);
  });
});
