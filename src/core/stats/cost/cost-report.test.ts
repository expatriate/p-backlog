import { describe, expect, it } from "vitest";
import { formatLocalIso } from "../../model/dates";
import type { CliRun, ScanProgress, TokenCounts, UsageBucket } from "../types";
import { costReport } from "./cost-report";

const NOW = new Date(2026, 8, 19, 12);
const SCAN: ScanProgress = { listed: true, filesTotal: 3, filesDone: 3, bytesLeft: 0 };
const PROJECT_OF = (cwd: string): string | null => (cwd.includes("spa") ? "spa" : cwd.includes("ti") ? "ti" : null);

function dayAt(offset: number): string {
  return formatLocalIso(new Date(2026, 8, 19 - offset, 12)).slice(0, 10);
}

function atAt(offset: number, hour = 10): string {
  return formatLocalIso(new Date(2026, 8, 19 - offset, hour));
}

function tokens(overrides: Partial<TokenCounts> = {}): TokenCounts {
  return { input: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0, ...overrides };
}

function bucket(overrides: Partial<UsageBucket> = {}): UsageBucket {
  return { day: dayAt(0), cwd: "/Users/x/projects/spa", model: "claude-sonnet-5", kind: "hook", tokens: tokens({ input: 1000 }), hookTurns: 0, ...overrides };
}

function run(overrides: Partial<CliRun> = {}): CliRun {
  return { at: atAt(0), command: "list", cwd: "/Users/x/projects/spa", ms: 100, rssMb: 80, exitCode: 0, ...overrides };
}

describe("отчёт о стоимости", () => {
  it("totals — только последние 7 дней, days — 30 дней с пустыми днями по нулям", () => {
    const buckets = [
      bucket({ day: dayAt(0), tokens: tokens({ input: 1000, output: 200 }) }),
      bucket({ day: dayAt(6), kind: "cli", tokens: tokens({ cacheWrite5m: 300 }) }),
      bucket({ day: dayAt(10), tokens: tokens({ input: 5000 }) }),
      bucket({ day: dayAt(29), tokens: tokens({ input: 7 }) }),
      bucket({ day: dayAt(35), tokens: tokens({ input: 999 }) }),
    ];
    const runs = [run({ at: atAt(0), command: "hook stop" }), run({ at: atAt(10), command: "list" })];

    const report = costReport({ buckets, runs, projectOf: PROJECT_OF, now: NOW, scan: SCAN });

    expect(report.totals).toEqual({ tokens: 1500, cost: (1000 * 2 + 200 * 10 + 300 * 2 * 1.25) / 1_000_000, hookTurns: 0, cliRuns: 0, hookRuns: 1 });
    expect(report.days).toHaveLength(30);
    expect(report.days[29]).toMatchObject({ day: dayAt(0), hookTokens: 1200, cliTokens: 0 });
    expect(report.days[23]).toMatchObject({ day: dayAt(6), hookTokens: 0, cliTokens: 300 });
    expect(report.days[19]).toMatchObject({ day: dayAt(10), hookTokens: 5000, cliRuns: 1, hookRuns: 0 });
    expect(report.days[0]).toMatchObject({ day: dayAt(29), hookTokens: 7 });
  });

  it("день без данных — все поля нулевые, cost — 0, а не null", () => {
    const report = costReport({ buckets: [bucket({ day: dayAt(0) })], runs: [], projectOf: PROJECT_OF, now: NOW, scan: SCAN });

    const empty = report.days.find((day) => day.day === dayAt(5));
    expect(empty).toEqual({ day: dayAt(5), hookTokens: 0, cliTokens: 0, cost: 0, hookTurns: 0, cliRuns: 0, hookRuns: 0 });
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

    expect(report.totals.cost).toBe((1000 * 2) / 1_000_000);
    const unknown = report.models.find((model) => model.model === "claude-unknown-9");
    const known = report.models.find((model) => model.model === "claude-sonnet-5");
    expect(unknown).toMatchObject({ tokens: 1000, cost: null });
    expect(known).toMatchObject({ tokens: 1000, cost: (1000 * 2) / 1_000_000 });
  });

  it("период целиком без цены — cost периода null", () => {
    const report = costReport({ buckets: [bucket({ model: "claude-unknown-9", tokens: tokens({ input: 1000 }) })], runs: [], projectOf: PROJECT_OF, now: NOW, scan: SCAN });

    expect(report.totals.cost).toBeNull();
  });

  it("models — по убыванию токенов за весь охваченный период", () => {
    const buckets = [
      bucket({ model: "claude-haiku-4-5", day: dayAt(25), tokens: tokens({ input: 100 }) }),
      bucket({ model: "claude-opus-5", day: dayAt(1), tokens: tokens({ input: 900 }) }),
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

  it("since — самый ранний день среди учтённого вклада в области", () => {
    const buckets = [bucket({ day: dayAt(3) }), bucket({ day: dayAt(20) })];

    expect(costReport({ buckets, runs: [], projectOf: PROJECT_OF, now: NOW, scan: SCAN }).since).toBe(dayAt(20));
    expect(costReport({ buckets: [], runs: [], projectOf: PROJECT_OF, now: NOW, scan: SCAN }).since).toBeNull();
  });

  it("scan передаётся в отчёт без изменений", () => {
    expect(costReport({ buckets: [], runs: [], projectOf: PROJECT_OF, now: NOW, scan: SCAN }).scan).toEqual(SCAN);
  });
});
