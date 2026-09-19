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
      makeTask({ id: "SPA-3", created: iso(8, 16), status: "in-progress" }),
      makeTask({ id: "SPA-4", created: iso(7, 20), status: "blocked" }),
    ];
    const events: JournalEvent[] = [{ at: iso(8, 3), task: "SPA-4", via: "cli", kind: "status", from: "backlog", to: "blocked" }];

    expect(statsSignals({ tasks, journals: journal(events), now: NOW, projectId: "spa" })).toEqual([
      { kind: "debt-growing", text: "Долг растёт третью неделю подряд: за 3 недели создано 3, закрыто 0" },
      { kind: "urgent-stale", text: "Срочные задачи ждут дольше 7 дней: 1" },
      { kind: "stuck", text: "Застряли в работе: 1, дольше всех SPA-4 — 15 дн." },
    ]);
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
      { at: iso(8, 15), task: task.id, via: "check", kind: "candidate", evidence: "source-changed", mode: "changed" },
      index === 0
        ? { at: iso(8, 16), task: task.id, via: "cli", kind: "status", from: "backlog", to: "done", resolution: "fixed" }
        : { at: iso(8, 16), task: task.id, via: "cli", kind: "verified" },
    ]);

    expect(statsSignals({ tasks, journals: journal(events), now: NOW, projectId: "spa" }).filter((signal) => signal.kind === "noisy-check")).toEqual([
      { kind: "noisy-check", text: "Проверка «код изменился» почти всегда ошибается: точность 10% на 10 решённых" },
    ]);
  });

  it("порог по процентам, как в таблице точности: 19 из 97 (20%) — не тревога, 18 из 97 (19%) — тревога", () => {
    const noisy = (closedCount: number) => {
      const tasks = Array.from({ length: 97 }, (_, index) => makeTask({ id: `SPA-${index + 1}`, created: iso(8, 14) }));
      const events: JournalEvent[] = tasks.flatMap((task, index) => [
        { at: iso(8, 15), task: task.id, via: "check", kind: "candidate", evidence: "source-changed", mode: "changed" },
        index < closedCount
          ? { at: iso(8, 16), task: task.id, via: "cli", kind: "status", from: "backlog", to: "done", resolution: "fixed" }
          : { at: iso(8, 16), task: task.id, via: "cli", kind: "verified" },
      ]);
      return statsSignals({ tasks, journals: journal(events), now: NOW, projectId: "spa" }).filter((signal) => signal.kind === "noisy-check");
    };

    expect(noisy(19)).toEqual([]);
    expect(noisy(18)).toEqual([{ kind: "noisy-check", text: "Проверка «код изменился» почти всегда ошибается: точность 19% на 97 решённых" }]);
  });

  it("«не меньше»: задача в работе без перехода в журнале и старше 7 дней — тревога есть", () => {
    const tasks = [makeTask({ id: "SPA-1", created: iso(8, 9), status: "in-progress" })];

    expect(statsSignals({ tasks, journals: journal([]), now: NOW, projectId: "spa" }).filter((signal) => signal.kind === "stuck")).toEqual([
      { kind: "stuck", text: "Застряли в работе: 1, дольше всех SPA-1 — 9 дн." },
    ]);
  });
});
