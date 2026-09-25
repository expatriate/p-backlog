import { describe, expect, it } from "vitest";
import { formatLocalIso } from "../../model/dates";
import type { CliRun } from "../../store/runs";
import type { ScanProgress } from "../types";
import type { TokenCounts } from "./token-counts";
import type { UsageBucket } from "./usage-state";
import { attributeLine, newTranscriptState } from "./attribute";
import { costReport } from "./cost-report";

const NOW = new Date(2026, 8, 19, 12);
const SCAN: ScanProgress = { listed: true, filesTotal: 3, filesDone: 3, bytesLeft: 0 };
const PROJECT_OF = (cwd: string): string | null => (cwd.includes("spa") ? "spa" : cwd.includes("ti") ? "ti" : null);

function dayAt(offset: number): string {
  return formatLocalIso(new Date(2026, 8, 19 - offset, 12)).slice(0, 10);
}

function slotAt(offset: number): string {
  return new Date(2026, 8, 19 - offset, 10).toISOString();
}

function atAt(offset: number, hour = 10): string {
  return formatLocalIso(new Date(2026, 8, 19 - offset, hour));
}

function tokens(overrides: Partial<TokenCounts> = {}): TokenCounts {
  return { input: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0, ...overrides };
}

function bucket(overrides: Partial<UsageBucket> = {}): UsageBucket {
  return { slot: slotAt(0), cwd: "/Users/x/projects/spa", model: "claude-sonnet-5", kind: "hook", tokens: tokens({ input: 1000 }), hookTurns: 0, ...overrides };
}

function run(overrides: Partial<CliRun> = {}): CliRun {
  return { at: atAt(0), command: "list", cwd: "/Users/x/projects/spa", ms: 100, rssMb: 80, exitCode: 0, ...overrides };
}

describe("отчёт о стоимости", () => {
  it("totals — только последние 7 дней, days — 30 дней с пустыми днями по нулям", () => {
    const buckets = [
      bucket({ slot: slotAt(0), tokens: tokens({ input: 1000, output: 200 }) }),
      bucket({ slot: slotAt(6), kind: "cli", tokens: tokens({ cacheWrite5m: 300 }) }),
      bucket({ slot: slotAt(10), tokens: tokens({ input: 5000 }) }),
      bucket({ slot: slotAt(29), tokens: tokens({ input: 7 }) }),
      bucket({ slot: slotAt(35), tokens: tokens({ input: 999 }) }),
    ];
    const runs = [run({ at: atAt(0), command: "hook stop" }), run({ at: atAt(10), command: "list" })];

    const report = costReport({ buckets, runs, projectOf: PROJECT_OF, now: NOW, scan: SCAN });

    expect(report.totals).toEqual({ tokens: 1500, cost: (1000 * 2 + 200 * 10 + 300 * 2 * 1.25) / 1_000_000, hasUnpricedTokens: false, hookTurns: 0, cliRuns: 0, hookRuns: 1 });
    expect(report.days).toHaveLength(30);
    expect(report.days[29]).toMatchObject({ day: dayAt(0), hookTokens: 1200, cliTokens: 0 });
    expect(report.days[23]).toMatchObject({ day: dayAt(6), hookTokens: 0, cliTokens: 300 });
    expect(report.days[19]).toMatchObject({ day: dayAt(10), hookTokens: 5000, cliRuns: 1, hookRuns: 0 });
    expect(report.days[0]).toMatchObject({ day: dayAt(29), hookTokens: 7 });
  });

  it("день без данных — все поля нулевые, cost — 0, а не null", () => {
    const report = costReport({ buckets: [bucket({ slot: slotAt(0) })], runs: [], projectOf: PROJECT_OF, now: NOW, scan: SCAN });

    const empty = report.days.find((day) => day.day === dayAt(5));
    expect(empty).toEqual({ day: dayAt(5), hookTokens: 0, cliTokens: 0, cost: 0, hasUnpricedTokens: false, hookTurns: 0, cliRuns: 0, hookRuns: 0 });
  });

  it("область проекта отсекает чужие вклад и запуски, во «Всех проектах» — всё", () => {
    const buckets = [bucket({ cwd: "/Users/x/projects/spa", tokens: tokens({ input: 100 }) }), bucket({ cwd: "/Users/x/projects/ti", tokens: tokens({ input: 900 }) })];
    const runs = [run({ cwd: "/Users/x/projects/spa" }), run({ cwd: "/Users/x/projects/ti" }), run({ cwd: "/Users/x/projects/unknown" })];

    const scoped = costReport({ buckets, runs, projectOf: PROJECT_OF, projectId: "spa", now: NOW, scan: SCAN });
    const all = costReport({ buckets, runs, projectOf: PROJECT_OF, now: NOW, scan: SCAN });

    expect(scoped.totals.tokens).toBe(100);
    expect(scoped.totals.cliRuns).toBe(1);
    expect(all.totals.tokens).toBe(1000);
    expect(all.totals.cliRuns).toBe(3);
  });

  it("модель без цены не обнуляет стоимость периода, но обнуляет свою собственную строку в models", () => {
    const buckets = [bucket({ model: "claude-sonnet-5", tokens: tokens({ input: 1000 }) }), bucket({ model: "claude-unknown-9", tokens: tokens({ input: 1000 }) })];

    const report = costReport({ buckets, runs: [], projectOf: PROJECT_OF, now: NOW, scan: SCAN });

    expect(report.totals).toMatchObject({ cost: (1000 * 2) / 1_000_000, hasUnpricedTokens: true });
    const unknown = report.models.find((model) => model.model === "claude-unknown-9");
    const known = report.models.find((model) => model.model === "claude-sonnet-5");
    expect(unknown).toMatchObject({ tokens: 1000, cost: null });
    expect(known).toMatchObject({ tokens: 1000, cost: (1000 * 2) / 1_000_000 });
    expect(report.days.find((day) => day.day === dayAt(0))).toMatchObject({ cost: (1000 * 2) / 1_000_000, hasUnpricedTokens: true });
    expect(report.days.find((day) => day.day === dayAt(1))).toMatchObject({ hasUnpricedTokens: false });
  });

  it("новая модель с id известной как префиксом считается моделью без цены", () => {
    const buckets = [bucket({ model: "claude-sonnet-5-1", tokens: tokens({ input: 1000 }) })];

    const report = costReport({ buckets, runs: [], projectOf: PROJECT_OF, now: NOW, scan: SCAN });

    expect(report.totals).toMatchObject({ cost: null, hasUnpricedTokens: true });
  });

  it("модель без цены вне недели итогов не помечает недельную стоимость как неполную", () => {
    const buckets = [bucket({ model: "claude-unknown-9", slot: slotAt(20) }), bucket({ model: "claude-sonnet-5" })];

    const report = costReport({ buckets, runs: [], projectOf: PROJECT_OF, now: NOW, scan: SCAN });

    expect(report.totals.hasUnpricedTokens).toBe(false);
    expect(report.models.map((model) => model.model)).toContain("claude-unknown-9");
  });

  it("период целиком без цены — cost периода null", () => {
    const report = costReport({ buckets: [bucket({ model: "claude-unknown-9", tokens: tokens({ input: 1000 }) })], runs: [], projectOf: PROJECT_OF, now: NOW, scan: SCAN });

    expect(report.totals.cost).toBeNull();
  });

  it("models — по убыванию токенов за весь охваченный период", () => {
    const buckets = [
      bucket({ model: "claude-haiku-4-5", slot: slotAt(25), tokens: tokens({ input: 100 }) }),
      bucket({ model: "claude-opus-5", slot: slotAt(1), tokens: tokens({ input: 900 }) }),
    ];

    const report = costReport({ buckets, runs: [], projectOf: PROJECT_OF, now: NOW, scan: SCAN });

    expect(report.models.map((model) => model.model)).toEqual(["claude-opus-5", "claude-haiku-4-5"]);
  });

  it("команды за 30 дней — среднее время и память, пик памяти, порядок по числу запусков", () => {
    const runs = [
      run({ command: "list", ms: 100, rssMb: 80, at: atAt(1) }),
      run({ command: "list", ms: 300, rssMb: 120, at: atAt(2) }),
      run({ command: "hook stop", ms: 60, rssMb: 60, at: atAt(3) }),
      run({ command: "hook stop", ms: 180, rssMb: 180, at: atAt(4) }),
      run({ command: "hook stop", ms: 120, rssMb: 120, at: atAt(5) }),
      run({ command: "hook stop", ms: 999, rssMb: 999, at: atAt(40) }),
    ];

    const report = costReport({ buckets: [], runs, projectOf: PROJECT_OF, now: NOW, scan: SCAN });

    expect(report.commands).toEqual([
      { command: "hook stop", runs: 3, avgMs: 120, avgRssMb: 120, maxRssMb: 180 },
      { command: "list", runs: 2, avgMs: 200, avgRssMb: 100, maxRssMb: 120 },
    ]);
  });

  it("недели: значения недели равны сумме дней этой недели", () => {
    const buckets = [
      bucket({ slot: slotAt(6), tokens: tokens({ input: 400, output: 100 }) }),
      bucket({ slot: slotAt(9), kind: "cli", tokens: tokens({ input: 300 }) }),
      bucket({ slot: slotAt(12), model: "claude-unknown-9", tokens: tokens({ input: 200 }) }),
    ];
    const runs = [run({ at: atAt(6) }), run({ at: atAt(9), command: "hook stop" }), run({ at: atAt(12) })];

    const report = costReport({ buckets, runs, projectOf: PROJECT_OF, now: NOW, scan: SCAN });

    const weekOffsets = [6, 7, 8, 9, 10, 11, 12];
    const weekDays = weekOffsets.flatMap((offset) => report.days.filter((day) => day.day === dayAt(offset)));
    const week = report.weeks.find((candidate) => candidate.start === formatLocalIso(new Date(2026, 8, 7)));

    expect(weekDays).toHaveLength(7);
    expect(week).toBeDefined();
    expect(week?.hookTokens).toBe(weekDays.reduce((total, day) => total + day.hookTokens, 0));
    expect(week?.cliTokens).toBe(weekDays.reduce((total, day) => total + day.cliTokens, 0));
    expect(week?.hookTurns).toBe(weekDays.reduce((total, day) => total + day.hookTurns, 0));
    expect(week?.cliRuns).toBe(weekDays.reduce((total, day) => total + day.cliRuns, 0));
    expect(week?.hookRuns).toBe(weekDays.reduce((total, day) => total + day.hookRuns, 0));
    expect(week?.hasUnpricedTokens).toBe(weekDays.some((day) => day.hasUnpricedTokens));
    expect(week?.cost).toBe(weekDays.reduce((total, day) => total + (day.cost ?? 0), 0));
  });

  it("день старше 30 дней, но в пределах 12 недель, входит в недели, а не в days", () => {
    const buckets = [bucket({ slot: slotAt(40), tokens: tokens({ input: 1000 }) })];
    const runs = [run({ at: atAt(40) })];

    const report = costReport({ buckets, runs, projectOf: PROJECT_OF, now: NOW, scan: SCAN });

    expect(report.days.some((day) => day.day === dayAt(40))).toBe(false);
    const totalWeekTokens = report.weeks.reduce((total, week) => total + week.hookTokens, 0);
    expect(totalWeekTokens).toBe(1000);
  });

  it("since — самый ранний день среди учтённого вклада в области", () => {
    const buckets = [bucket({ slot: slotAt(3) }), bucket({ slot: slotAt(20) })];

    expect(costReport({ buckets, runs: [], projectOf: PROJECT_OF, now: NOW, scan: SCAN }).since).toBe(dayAt(20));
    expect(costReport({ buckets: [], runs: [], projectOf: PROJECT_OF, now: NOW, scan: SCAN }).since).toBeNull();
  });

  it("scan передаётся в отчёт без изменений", () => {
    expect(costReport({ buckets: [], runs: [], projectOf: PROJECT_OF, now: NOW, scan: SCAN }).scan).toEqual(SCAN);
  });

  it("модель без токенов (ход хука до первого ответа) в таблицу моделей не попадает", () => {
    const buckets = [bucket({ model: "unknown", tokens: tokens(), hookTurns: 1 }), bucket({ model: "claude-sonnet-5" })];

    expect(costReport({ buckets, runs: [], projectOf: PROJECT_OF, now: NOW, scan: SCAN }).models.map((row) => row.model)).toEqual(["claude-sonnet-5"]);
  });

  it("день затрат берётся в поясе отчёта, а не в поясе, где просканирована расшифровка: токены и запуски хука одного момента — в одном дне", () => {
    const moment = "2026-09-18T22:30:00.000Z";
    const cwd = "/Users/x/projects/spa";
    const previousZone = process.env.TZ;
    try {
      process.env.TZ = "Europe/Moscow";
      const state = newTranscriptState();
      const buckets = [
        ...attributeLine({ type: "user", isMeta: true, timestamp: moment, cwd, message: { content: "Stop hook feedback:\nБеклог spa: менялся код задач — SPA-1" } }, state),
        ...attributeLine({ type: "assistant", timestamp: moment, cwd, message: { id: "msg_1", model: "claude-sonnet-5", usage: { input_tokens: 700 } } }, state),
      ];
      process.env.TZ = "America/New_York";
      const report = costReport({ buckets, runs: [run({ at: moment, command: "hook stop", cwd })], projectOf: PROJECT_OF, now: new Date("2026-09-19T16:00:00.000Z"), scan: SCAN });

      expect(report.days.filter((day) => day.hookTurns + day.hookTokens + day.hookRuns > 0)).toEqual([expect.objectContaining({ day: "2026-09-18", hookTurns: 1, hookTokens: 700, hookRuns: 1 })]);
    } finally {
      if (previousZone === undefined) delete process.env.TZ;
      else process.env.TZ = previousZone;
    }
  });
});
