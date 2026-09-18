import { describe, expect, it } from "vitest";
import { makeTask } from "../model/testing/make-task";
import { changeEvents, createdEvent, deletedEvent, journalEventSchema } from "./events";

const NOW = new Date(2026, 8, 18, 12, 0, 0);
const AT = "2026-09-18T12:00:00";

describe("события журнала", () => {
  it("создание хранит тип, приоритет, теги, source и эпик", () => {
    const task = makeTask({ id: "SPA-1", priority: "high", tags: ["upload"], source: "src/a.ts:3", epic: "SPA-9" });

    const event = createdEvent(task, NOW, "cli");

    expect(event).toMatchObject({ task: "SPA-1", kind: "created", via: "cli", type: "task", priority: "high", tags: ["upload"], source: "src/a.ts:3", epic: "SPA-9" });
    expect(event.at.startsWith(AT)).toBe(true);
  });

  it("смена статуса и приоритета дают по событию, закрытие несёт причину", () => {
    const before = makeTask({ id: "SPA-1", status: "backlog", priority: "low" });
    const after = makeTask({ id: "SPA-1", status: "done", priority: "high", resolution: "fixed" });

    expect(changeEvents(before, after, NOW, "web")).toMatchObject([
      { kind: "status", from: "backlog", to: "done", resolution: "fixed", via: "web" },
      { kind: "priority", from: "low", to: "high", via: "web" },
    ]);
  });

  it("смена только приоритета — одно событие приоритета", () => {
    const before = makeTask({ id: "SPA-1", priority: "low" });
    const after = makeTask({ id: "SPA-1", priority: "high" });

    expect(changeEvents(before, after, NOW, "cli")).toMatchObject([{ kind: "priority", from: "low", to: "high", via: "cli" }]);
  });

  it("возврат в беклог — событие статуса без причины", () => {
    const before = makeTask({ id: "SPA-1", status: "done", resolution: "fixed" });
    const after = makeTask({ id: "SPA-1", status: "backlog" });

    const [event] = changeEvents(before, after, NOW, "web");

    expect(event).toMatchObject({ kind: "status", from: "done", to: "backlog" });
    expect(event && "resolution" in event ? event.resolution : undefined).toBeUndefined();
  });

  it("без смены статуса и приоритета событий нет", () => {
    const task = makeTask({ id: "SPA-1" });

    expect(changeEvents(task, { ...task, title: "Другое" }, NOW, "cli")).toEqual([]);
  });

  it("удаление хранит снимок frontmatter без тела и путей, снимок проходит схему", () => {
    const task = makeTask({ id: "SPA-1", status: "done", closed: "2026-09-10T10:00:00+03:00", resolution: "fixed", body: "длинное описание" });

    const event = deletedEvent(task, NOW, "sweep");

    expect(event).toMatchObject({ kind: "deleted", via: "sweep", snapshot: { id: "SPA-1", status: "done", resolution: "fixed" } });
    expect(JSON.stringify(event)).not.toContain("длинное описание");
    expect(journalEventSchema.safeParse(JSON.parse(JSON.stringify(event))).success).toBe(true);
  });
});
