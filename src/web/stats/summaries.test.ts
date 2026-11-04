import { describe, expect, it } from "vitest";
import type { CostPeriod, FlowPeriod } from "../../core/api/contract";
import { NBSP } from "../../core/i18n/plural";
import { summarizeIntake, summarizeSpend } from "./summaries";

const periodFrom = (day: number, created: number): FlowPeriod => ({ start: `2026-09-${String(day).padStart(2, "0")}T00:00:00+03:00`, created, closed: 0, openAtEnd: created });

describe("среднее создание задач", () => {
  it("у молодого проекта считается с первой активности, текущая неделя — по прошедшей доле", () => {
    const periods = [1, 8, 15].map((day) => periodFrom(day, 0)).concat(periodFrom(22, 4), periodFrom(29, 2));
    expect(summarizeIntake("week", periods, "2026-10-02T12:00:00+03:00").perPeriod).toBe(4);
  });

  it("проект, начатый сегодня, не делит на долю дня", () => {
    expect(summarizeIntake("day", [periodFrom(29, 3)], "2026-09-29T00:30:00+03:00").perPeriod).toBe(3);
  });
});

const spend = (cost: number | null, hasUnpricedTokens: boolean): CostPeriod => ({
  start: "2026-09-29T00:00:00+03:00",
  hookTokens: 100,
  cliTokens: 0,
  cost,
  hasUnpricedTokens,
  hookTurns: 1,
  cliRuns: 0,
  hookRuns: 1,
});

describe("деньги в сводке расхода", () => {
  it("без единой цены — прочерк без «≈»", () => {
    expect(summarizeSpend("ru", "day", [spend(null, true)], "без цены").money).toBe("—");
  });

  it("часть периодов без цены — сумма помечена как неполная", () => {
    expect(summarizeSpend("en", "day", [spend(1.5, false), spend(null, true)], "unpriced").money).toBe(`≈${NBSP}$1.50 (unpriced)`);
  });
});
