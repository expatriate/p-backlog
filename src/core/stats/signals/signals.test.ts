import { describe, expect, it } from "vitest";
import type { JournalEvent } from "../../journal/events";
import { formatLocalIso } from "../../model/dates";
import { makeTask } from "../../model/testing/make-task";
import { statsSignals } from "./signals";

const NOW = new Date(2026, 8, 18, 12);
const iso = (month: number, day: number) => formatLocalIso(new Date(2026, month, day, 12));
const journal = (events: JournalEvent[]) => [{ projectId: "spa", events, invalidLines: 0 }];

describe("тревоги", () => {
  it("долг растёт три недели подряд, срочное висит, застряло в работе", () => {
    const tasks = [
      makeTask({ id: "SPA-1", created: iso(8, 2), priority: "critical" }),
      makeTask({ id: "SPA-2", created: iso(8, 9) }),
      makeTask({ id: "SPA-3", created: iso(7, 26) }),
      makeTask({ id: "SPA-4", created: iso(7, 20), status: "blocked" }),
    ];
    const events: JournalEvent[] = [{ at: iso(8, 3), task: "SPA-4", via: "cli", kind: "status", from: "backlog", to: "blocked" }];

    expect(statsSignals({ tasks, journals: journal(events), now: NOW, projectId: "spa" })).toEqual([
      { kind: "debt-growing", params: { weeks: 3, created: 3, closed: 0 } },
      { kind: "urgent-stale", params: { days: 7, count: 1 } },
      { kind: "stuck", params: { count: 1, id: "SPA-4", days: 15 } },
    ]);
  });

  it("рост долга считается по полным неделям: задача, созданная в понедельник утром, его не создаёт", () => {
    const mondayMorning = new Date(2026, 8, 21, 9);
    const tasks = [
      makeTask({ id: "SPA-1", created: iso(8, 9) }),
      makeTask({ id: "SPA-2", created: iso(8, 16) }),
      makeTask({ id: "SPA-3", created: formatLocalIso(new Date(2026, 8, 21, 8)) }),
    ];

    expect(statsSignals({ tasks, journals: journal([]), now: mondayMorning, projectId: "spa" })).toEqual([]);
  });

  it("на пороге тревог нет: неделя без роста, срочное ровно 6 дней, в работе 7 дней, блокировка 14 дней", () => {
    const tasks = [
      makeTask({ id: "SPA-1", created: iso(8, 12), priority: "high" }),
      makeTask({ id: "SPA-2", created: iso(8, 11), status: "in-progress" }),
      makeTask({ id: "SPA-3", created: iso(7, 20), status: "blocked" }),
      makeTask({ id: "SPA-4", created: iso(8, 2), status: "done", closed: iso(8, 3) }),
    ];
    const events: JournalEvent[] = [
      { at: iso(8, 11), task: "SPA-2", via: "cli", kind: "status", from: "backlog", to: "in-progress" },
      { at: iso(8, 4), task: "SPA-3", via: "cli", kind: "status", from: "backlog", to: "blocked" },
    ];

    expect(statsSignals({ tasks, journals: journal(events), now: NOW, projectId: "spa" })).toEqual([]);
  });

  it("шумная проверка: вид улики с 10 решёнными и точностью ниже 20%", () => {
    const tasks = Array.from({ length: 10 }, (_, index) => makeTask({ id: `SPA-${index + 1}`, created: iso(8, 14) }));
    const events: JournalEvent[] = tasks.flatMap((task, index) => [
      { at: iso(8, 15), task: task.id, via: "check", kind: "candidate", evidence: "source-changed", mode: "changed", method: "file" },
      index === 0
        ? { at: iso(8, 16), task: task.id, via: "cli", kind: "status", from: "backlog", to: "done", resolution: "fixed" }
        : { at: iso(8, 16), task: task.id, via: "cli", kind: "verified" },
    ]);

    expect(statsSignals({ tasks, journals: journal(events), now: NOW, projectId: "spa" }).filter((signal) => signal.kind === "noisy-check")).toEqual([
      { kind: "noisy-check", params: { evidence: "source-changed", method: "file", percent: 10, decided: 10, windowDays: 14 } },
    ]);
  });

  it("порог по процентам, как в таблице точности: 19 из 97 (20%) — не тревога, 18 из 97 (19%) — тревога", () => {
    const noisy = (closedCount: number) => {
      const tasks = Array.from({ length: 97 }, (_, index) => makeTask({ id: `SPA-${index + 1}`, created: iso(8, 14) }));
      const events: JournalEvent[] = tasks.flatMap((task, index) => [
        { at: iso(8, 15), task: task.id, via: "check", kind: "candidate", evidence: "source-changed", mode: "changed", method: "file" },
        index < closedCount
          ? { at: iso(8, 16), task: task.id, via: "cli", kind: "status", from: "backlog", to: "done", resolution: "fixed" }
          : { at: iso(8, 16), task: task.id, via: "cli", kind: "verified" },
      ]);
      return statsSignals({ tasks, journals: journal(events), now: NOW, projectId: "spa" }).filter((signal) => signal.kind === "noisy-check");
    };

    expect(noisy(19)).toEqual([]);
    expect(noisy(18)).toEqual([{ kind: "noisy-check", params: { evidence: "source-changed", method: "file", percent: 19, decided: 97, windowDays: 14 } }]);
  });

  it("шумный способ проверки называется отдельно и не прячется за точным: по файлу — тревога, по строкам source — нет", () => {
    const tasks = Array.from({ length: 20 }, (_, index) => makeTask({ id: `SPA-${index + 1}`, created: iso(8, 14) }));
    const events: JournalEvent[] = tasks.flatMap((task, index): JournalEvent[] => {
      const byAnchor = index % 2 === 0;
      const fixed = byAnchor && index % 4 === 0;
      return [
        { at: iso(8, 15), task: task.id, via: "check", kind: "candidate", evidence: "source-changed", mode: "changed", method: byAnchor ? "anchor" : "file" },
        fixed
          ? { at: iso(8, 16), task: task.id, via: "cli", kind: "status", from: "backlog", to: "done", resolution: "fixed" }
          : { at: iso(8, 16), task: task.id, via: "cli", kind: "verified" },
      ];
    });

    const noisy = statsSignals({ tasks, journals: journal(events), now: NOW, projectId: "spa" }).filter((signal) => signal.kind === "noisy-check");

    expect(noisy).toEqual([{ kind: "noisy-check", params: { evidence: "source-changed", method: "file", percent: 0, decided: 10, windowDays: 14 } }]);
  });

  it("по символу и по строкам source подтверждение — не ошибка: менялось само место проблемы, тревоги нет", () => {
    const tasks = Array.from({ length: 20 }, (_, index) => makeTask({ id: `SPA-${index + 1}`, created: iso(8, 14) }));
    const events: JournalEvent[] = tasks.flatMap((task, index): JournalEvent[] => [
      { at: iso(8, 15), task: task.id, via: "check", kind: "candidate", evidence: "source-changed", mode: "changed", method: index % 2 === 0 ? "anchor" : "symbol" },
      { at: iso(8, 16), task: task.id, via: "cli", kind: "verified" },
    ]);

    const noisy = statsSignals({ tasks, journals: journal(events), now: NOW, projectId: "spa" }).filter((signal) => signal.kind === "noisy-check");

    expect(noisy).toEqual([]);
  });

  it("кандидаты до записи способа в тревогу не идут: неизвестно, были ли они найдены по файлу", () => {
    const tasks = Array.from({ length: 12 }, (_, index) => makeTask({ id: `SPA-${index + 1}`, created: iso(8, 14) }));
    const events: JournalEvent[] = tasks.flatMap((task): JournalEvent[] => [
      { at: iso(8, 15), task: task.id, via: "check", kind: "candidate", evidence: "source-changed", mode: "changed" },
      { at: iso(8, 16), task: task.id, via: "cli", kind: "verified" },
    ]);

    expect(statsSignals({ tasks, journals: journal(events), now: NOW, projectId: "spa" }).filter((signal) => signal.kind === "noisy-check")).toEqual([]);
  });

  it("старый всплеск кандидатов не держит тревогу: за две недели решений мало", () => {
    const old = Array.from({ length: 40 }, (_, index) => makeTask({ id: `SPA-${index + 1}`, created: iso(7, 1) }));
    const events: JournalEvent[] = old.flatMap((task) => [
      { at: iso(7, 2), task: task.id, via: "check", kind: "candidate", evidence: "source-changed", mode: "changed", method: "file" },
      { at: iso(7, 3), task: task.id, via: "cli", kind: "verified" },
    ]);

    const signals = statsSignals({ tasks: old, journals: journal(events), now: NOW, projectId: "spa" });

    expect(signals.filter((signal) => signal.kind === "noisy-check")).toEqual([]);
  });

  it("улика «нет source» в тревогу не идёт: закрывать по ней нечего", () => {
    const tasks = Array.from({ length: 12 }, (_, index) => makeTask({ id: `SPA-${index + 1}`, created: iso(8, 14) }));
    const events: JournalEvent[] = tasks.flatMap((task) => [
      { at: iso(8, 15), task: task.id, via: "check", kind: "candidate", evidence: "no-source", mode: "full" },
      { at: iso(8, 16), task: task.id, via: "cli", kind: "verified" },
    ]);

    const signals = statsSignals({ tasks, journals: journal(events), now: NOW, projectId: "spa" });

    expect(signals.filter((signal) => signal.kind === "noisy-check")).toEqual([]);
  });

  it("«не меньше»: задача в работе без перехода в журнале и старше 7 дней — тревога есть", () => {
    const tasks = [makeTask({ id: "SPA-1", created: iso(8, 9), status: "in-progress" })];

    expect(statsSignals({ tasks, journals: journal([]), now: NOW, projectId: "spa" }).filter((signal) => signal.kind === "stuck")).toEqual([
      { kind: "stuck", params: { count: 1, id: "SPA-1", days: 9 } },
    ]);
  });

  it("задачи с низким приоритетом старше 30 дней, которые не брали в работу", () => {
    const tasks = [
      makeTask({ id: "SPA-1", created: iso(7, 1), priority: "low" }),
      makeTask({ id: "SPA-2", created: iso(7, 1), priority: "low", status: "in-progress" }),
      makeTask({ id: "SPA-3", created: iso(8, 10), priority: "low" }),
    ];

    expect(statsSignals({ tasks, journals: journal([]), now: NOW, projectId: "spa" })).toContainEqual({
      kind: "stale-low",
      params: { days: 30, count: 1 },
    });
  });
});
