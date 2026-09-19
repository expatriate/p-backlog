import { describe, expect, it } from "vitest";
import { makeTask } from "../model/testing/make-task";
import { candidateEvents, candidateGoneEvents, changeEvents, createdEvent, deletedEvent, journalEventSchema } from "./events";

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

  it("снимок удаления хранит категорию", () => {
    const task = makeTask({ id: "SPA-1", category: "bug" });

    const event = deletedEvent(task, NOW, "sweep");

    expect(event.kind === "deleted" && event.snapshot.category).toBe("bug");
  });
});

describe("новые поля и события", () => {
  it("создание хранит категорию, как найдена и происхождение", () => {
    const task = makeTask({ id: "SPA-1", category: "bug" });

    const event = createdEvent(task, NOW, "cli", { found: "review", origin: { branch: "feat/x", commit: "a1b2c3d" } });

    expect(event).toMatchObject({ kind: "created", category: "bug", found: "review", origin: { branch: "feat/x", commit: "a1b2c3d" } });
    expect(journalEventSchema.safeParse(JSON.parse(JSON.stringify(event))).success).toBe(true);
  });

  it("старая строка создания без новых полей остаётся валидной", () => {
    const old = { at: "2026-09-18T12:00:00+03:00", task: "SPA-1", via: "cli", kind: "created", type: "task", priority: "low", tags: [] };

    expect(journalEventSchema.safeParse(old).success).toBe(true);
  });

  it("кандидат пишется при первом появлении и после решения, повтор не пишется", () => {
    const sighting = { task: "SPA-1", evidence: "source-changed" as const };
    const first = candidateEvents([sighting], [], NOW, "changed");
    const repeat = candidateEvents([sighting], first, NOW, "changed");
    const afterVerify = candidateEvents(
      [sighting],
      [...first, { at: first[0]?.at ?? "", task: "SPA-1", via: "cli", kind: "verified" }],
      NOW,
      "full",
    );
    const otherEvidence = candidateEvents([{ task: "SPA-1", evidence: "no-source" }], first, NOW, "changed");

    expect(first).toMatchObject([{ kind: "candidate", task: "SPA-1", evidence: "source-changed", mode: "changed", via: "check" }]);
    expect(repeat).toEqual([]);
    expect(afterVerify).toMatchObject([{ kind: "candidate", mode: "full" }]);
    expect(otherEvidence).toHaveLength(1);
  });

  it("несколько наблюдений с одинаковыми task и evidence в одном вызове дают одно событие", () => {
    const sighting = { task: "SPA-1", evidence: "duplicate" as const };

    const events = candidateEvents([sighting, sighting], [], NOW, "full");

    expect(events).toHaveLength(1);
  });

  it("после закрытия и возврата кандидат снова новый", () => {
    const sighting = { task: "SPA-1", evidence: "source-missing" as const };
    const [first] = candidateEvents([sighting], [], NOW, "full");
    if (!first) throw new Error("нет события");
    const closed = { at: first.at, task: "SPA-1", via: "cli" as const, kind: "status" as const, from: "backlog" as const, to: "done" as const };
    const reopened = { at: first.at, task: "SPA-1", via: "web" as const, kind: "status" as const, from: "done" as const, to: "backlog" as const };

    expect(candidateEvents([sighting], [first, closed, reopened], NOW, "full")).toHaveLength(1);
  });

  it("новые события проходят схему", () => {
    const at = "2026-09-18T12:00:00+03:00";
    for (const event of [
      { at, task: "SPA-1", via: "web", kind: "category", from: "couplers", to: "bloaters" },
      { at, task: "SPA-1", via: "cli", kind: "verified", source: "src/a.ts:1" },
      { at, task: "SPA-1", via: "check", kind: "candidate", evidence: "duplicate", mode: "full" },
    ]) {
      expect(journalEventSchema.safeParse(event).success).toBe(true);
    }
  });

  it("улика пропала в полном прогоне — эпизод закрыт, её возвращение даёт новый эпизод", () => {
    const first = candidateEvents([{ task: "SPA-1", evidence: "source-changed" }], [], NOW, "full");
    const repeat = candidateEvents([{ task: "SPA-1", evidence: "source-changed" }], first, NOW, "full");
    expect(repeat).toEqual([]);

    const gone = candidateGoneEvents([], ["SPA-1"], first, NOW);
    expect(gone).toMatchObject([{ task: "SPA-1", kind: "candidate-gone", evidence: "source-changed" }]);
    expect(candidateGoneEvents([], ["SPA-1"], [...first, ...gone], NOW)).toEqual([]);

    expect(candidateEvents([{ task: "SPA-1", evidence: "source-changed" }], [...first, ...gone], NOW, "full")).toMatchObject([{ kind: "candidate" }]);
  });
});
