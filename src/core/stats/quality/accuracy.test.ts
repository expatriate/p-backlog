import { describe, expect, it } from "vitest";
import type { JournalEvent } from "../../journal/events";
import { formatLocalIso } from "../../model/dates";
import { makeTask } from "../../model/testing/make-task";
import { taskHistories } from "../history";
import { accuracy, accuracyWeeks, symbolAccuracy } from "./accuracy";

const at = (day: number, hour = 12) => new Date(2026, 8, day, hour);
const iso = (day: number, hour = 12) => formatLocalIso(at(day, hour));
const FROM = at(1).getTime();
const TO = at(18).getTime();
const journal = (events: JournalEvent[]) => [{ projectId: "spa", events, invalidLines: 0 }];

const candidate = (task: string, day: number, evidence: "source-changed" | "source-missing" | "duplicate" | "no-source"): JournalEvent => ({ at: iso(day), task, via: "check", kind: "candidate", evidence, mode: "changed" });
const symbolCandidate = (task: string, day: number): JournalEvent => ({ at: iso(day), task, via: "check", kind: "candidate", evidence: "source-changed", mode: "changed", bySymbol: true });
const verified = (task: string, day: number): JournalEvent => ({ at: iso(day), task, via: "cli", kind: "verified" });

describe("точность проверки", () => {
  it("исходы эпизодов по видам улик и итог", () => {
    const tasks = [
      makeTask({ id: "SPA-1", created: iso(1), status: "done", closed: iso(6), resolution: "fixed" }),
      makeTask({ id: "SPA-2", created: iso(1) }),
      makeTask({ id: "SPA-3", created: iso(1) }),
      makeTask({ id: "SPA-4", created: iso(1), status: "done", closed: iso(10), resolution: "obsolete" }),
      makeTask({ id: "SPA-5", created: iso(1) }),
    ];
    const events: JournalEvent[] = [
      candidate("SPA-1", 3, "source-changed"),
      candidate("SPA-1", 4, "source-missing"),
      { at: iso(6), task: "SPA-1", via: "cli", kind: "status", from: "backlog", to: "done", resolution: "fixed" },
      candidate("SPA-2", 3, "source-changed"),
      verified("SPA-2", 5),
      candidate("SPA-3", 7, "duplicate"),
      candidate("SPA-4", 8, "source-changed"),
      candidate("SPA-5", 9, "source-changed"),
      verified("SPA-5", 9),
    ];

    expect(accuracy(taskHistories(tasks, journal(events)), FROM, TO)).toEqual([
      { evidence: "source-changed", candidates: 4, closed: 2, verified: 1, open: 1, precision: 2 / 3 },
      { evidence: "source-missing", candidates: 1, closed: 1, verified: 0, open: 0, precision: 1 },
      { evidence: "duplicate", candidates: 1, closed: 0, verified: 0, open: 1, precision: null },
      { evidence: "total", candidates: 6, closed: 3, verified: 1, open: 2, precision: 0.75 },
    ]);
  });

  it("кандидаты вне периода не считаются, без эпизодов — пусто", () => {
    const tasks = [makeTask({ id: "SPA-1", created: iso(1) })];

    expect(accuracy(taskHistories(tasks, journal([candidate("SPA-1", 3, "source-changed")])), at(5).getTime(), TO)).toEqual([]);
  });

  it("по неделям: точность считается без улики «нет source»", () => {
    const tasks = [
      makeTask({ id: "SPA-1", created: iso(1), status: "done", closed: iso(16), resolution: "fixed" }),
      makeTask({ id: "SPA-2", created: iso(1) }),
      makeTask({ id: "SPA-3", created: iso(1) }),
    ];
    const events: JournalEvent[] = [
      candidate("SPA-1", 15, "source-changed"),
      { at: iso(16), task: "SPA-1", via: "cli", kind: "status", from: "backlog", to: "done", resolution: "fixed" },
      candidate("SPA-2", 15, "source-changed"),
      verified("SPA-2", 16),
      candidate("SPA-3", 15, "no-source"),
      verified("SPA-3", 16),
    ];

    const weeks = accuracyWeeks(taskHistories(tasks, journal(events)), at(18));

    expect(weeks).toHaveLength(12);
    expect(weeks.at(-1)).toMatchObject({ decided: 2, precision: 0.5 });
    expect(weeks.at(-2)).toMatchObject({ decided: 0, precision: null });
  });
});

describe("точность по способу проверки", () => {
  it("кандидаты, подтверждённые графом, считаются отдельно от проверенных по файлу", () => {
    const tasks = [
      makeTask({ id: "SPA-1", created: iso(1), status: "done", closed: iso(5), resolution: "fixed" }),
      makeTask({ id: "SPA-2", created: iso(1) }),
      makeTask({ id: "SPA-3", created: iso(1) }),
    ];
    const events: JournalEvent[] = [
      symbolCandidate("SPA-1", 3),
      { at: iso(5), task: "SPA-1", via: "cli", kind: "status", from: "backlog", to: "done", resolution: "fixed" },
      symbolCandidate("SPA-2", 3),
      verified("SPA-2", 4),
      candidate("SPA-3", 3, "source-changed"),
      verified("SPA-3", 4),
    ];

    expect(symbolAccuracy(taskHistories(tasks, journal(events)), FROM, TO)).toEqual([
      { by: "symbol", candidates: 2, closed: 1, verified: 1, open: 0, precision: 0.5 },
      { by: "file", candidates: 1, closed: 0, verified: 1, open: 0, precision: 0 },
    ]);
  });

  it("улики, кроме «код изменился», в разбиение не идут", () => {
    const tasks = [makeTask({ id: "SPA-1", created: iso(1) })];
    const events: JournalEvent[] = [candidate("SPA-1", 3, "duplicate"), verified("SPA-1", 4)];

    expect(symbolAccuracy(taskHistories(tasks, journal(events)), FROM, TO)).toEqual([]);
  });
});
