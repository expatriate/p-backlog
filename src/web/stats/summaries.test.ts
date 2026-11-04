import { describe, expect, it } from "vitest";
import type { CostPeriod, FlowPeriod } from "../../core/api/contract";
import { NBSP } from "../../core/i18n/plural";
import { statsEn, statsRu } from "./messages";
import { summarizeIntake, summarizeSpend } from "./summaries";

const periodFrom = (day: number, created: number): FlowPeriod => ({ start: `2026-09-${String(day).padStart(2, "0")}T00:00:00+03:00`, created, closed: 0, openAtEnd: created });

describe("среднее создание задач", () => {
  const quietThenBusy = [1, 8, 15].map((day) => periodFrom(day, 0)).concat(periodFrom(22, 4), periodFrom(29, 2));
  const intake = (backlogSince: string | null) => summarizeIntake("week", quietThenBusy, { now: "2026-10-02T12:00:00+03:00", backlogSince });

  it("у молодого проекта считается с недели первой задачи, текущая неделя — по прошедшей доле, и сводка называет начало", () => {
    expect(intake("2026-09-22T10:00:00+03:00")).toMatchObject({ perPeriod: 4, averageSince: "2026-09-22T00:00:00+03:00" });
  });

  it("у проекта старше окна тихие недели окна входят в среднее", () => {
    expect(intake("2026-01-10T10:00:00+03:00")).toMatchObject({ perPeriod: 6 / 4.5, averageSince: null });
  });

  it("проект, начатый сегодня, не делит на долю дня", () => {
    expect(summarizeIntake("day", [periodFrom(29, 3)], { now: "2026-09-29T00:30:00+03:00", backlogSince: "2026-09-29T00:10:00+03:00" }).perPeriod).toBe(3);
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
  it("без единой цены, даже рядом с днями без токенов, — прочерк без «≈» и без пометки о моделях без цены", () => {
    expect(statsRu.spendSummary(summarizeSpend("ru", "day", [spend(0, false), spend(null, true)]))).toContain("по ценам API —;");
  });

  it("часть периодов без цены — сумма помечена как неполная", () => {
    expect(statsEn.spendSummary(summarizeSpend("en", "day", [spend(1.5, false), spend(null, true)]))).toContain(`at API prices ≈${NBSP}$1.50 (excluding models with unknown prices);`);
  });
});
