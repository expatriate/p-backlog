import type { AccuracyPeriod, CostPeriod, EffectTotals, FlowPeriod } from "../../core/api/contract";
import { DAY_MS, WEEK_MS } from "../../core/model/dates";
import type { Language } from "../../core/i18n/language";
import { sum } from "../../core/numbers";
import { formatShare } from "../../core/stats/format";
import type { Grain } from "./charts/chart-style";
import { deferredCodeLines, formatEstimate, formatLines } from "./effect-format";
import { pricedCost, pricedCostText, wholeFormatter } from "./value-format";

type PeriodSummary = { grain: Grain; periodCount: number };

export type FlowSummary = PeriodSummary & { created: number; closed: number; openNow: number };

export type IntakeSummary = PeriodSummary & { created: number; average: { perPeriod: number; since: string | null } | null };

export type AccuracySummary = PeriodSummary & { decided: number; latestPrecision: string | null };

export type SpendSummary = PeriodSummary & { hookTokens: number; cliTokens: string; money: string; hookRuns: string; cliRuns: string };

export type LinesAmount = { formatted: string; count: number };

export type CodeAndTestsLines = { code: string; tests: string };

export type PendingEstimate = { openTasks: number; estimated: LinesAmount; perTask: string };

function periodSummary(grain: Grain, periods: readonly unknown[]): PeriodSummary {
  return { grain, periodCount: periods.length };
}

export function summarizeFlow(grain: Grain, periods: FlowPeriod[]): FlowSummary {
  return {
    ...periodSummary(grain, periods),
    created: sum(periods.map((period) => period.created)),
    closed: sum(periods.map((period) => period.closed)),
    openNow: periods.at(-1)?.openAtEnd ?? 0,
  };
}

const GRAIN_MS = { week: WEEK_MS, day: DAY_MS } satisfies Record<Grain, number>;

type IntakeMoments = { now: string; backlogSince: string | null };

export function summarizeIntake(grain: Grain, periods: FlowPeriod[], { now, backlogSince }: IntakeMoments): IntakeSummary {
  const created = sum(periods.map((period) => period.created));
  const summary = { ...periodSummary(grain, periods), created };
  const baseStart = backlogStartPeriod(periods, backlogSince);
  const onlyCurrentPeriod = baseStart === periods.length - 1;
  if (created === 0 || onlyCurrentPeriod) return { ...summary, average: null };
  const since = baseStart === 0 ? null : (periods[baseStart]?.start ?? null);
  return { ...summary, average: { perPeriod: created / periodsFrom(baseStart, grain, periods, now), since } };
}

function backlogStartPeriod(periods: FlowPeriod[], backlogSince: string | null): number {
  if (backlogSince === null) return 0;
  const backlogStart = Date.parse(backlogSince);
  return Math.max(
    0,
    periods.findLastIndex((period) => Date.parse(period.start) <= backlogStart),
  );
}

function periodsFrom(baseStart: number, grain: Grain, periods: FlowPeriod[], now: string): number {
  const current = periods.at(-1);
  const currentShare = current === undefined ? 1 : Math.min(1, (Date.parse(now) - Date.parse(current.start)) / GRAIN_MS[grain]);
  return periods.length - 1 - baseStart + currentShare;
}

export function summarizeAccuracy(grain: Grain, periods: AccuracyPeriod[]): AccuracySummary {
  const latest = periods.filter((period) => period.precision !== null).at(-1);
  return {
    ...periodSummary(grain, periods),
    decided: sum(periods.map((period) => period.decided)),
    latestPrecision: latest === undefined ? null : formatShare(latest.precision),
  };
}

export function summarizeSpend(language: Language, grain: Grain, periods: CostPeriod[], unpricedNote: string): SpendSummary {
  const total = (pick: (period: CostPeriod) => number) => sum(periods.map(pick));
  const whole = wholeFormatter(language);
  const spent = { cost: totalMoney(periods), hasUnpricedTokens: periods.some((period) => period.hasUnpricedTokens) };
  return {
    ...periodSummary(grain, periods),
    hookTokens: total((period) => period.hookTokens),
    cliTokens: whole(total((period) => period.cliTokens)),
    money: pricedCostText(pricedCost(language, spent), unpricedNote),
    hookRuns: whole(total((period) => period.hookRuns)),
    cliRuns: whole(total((period) => period.cliRuns)),
  };
}

function totalMoney(periods: CostPeriod[]): number | null {
  const spentCosts = periods.map((period) => period.cost).filter((cost) => cost !== 0);
  if (spentCosts.length > 0 && spentCosts.every((cost) => cost === null)) return null;
  return sum(spentCosts.map((cost) => cost ?? 0));
}

export function linesAmount(language: Language, lines: number, estimatedLines: number | null = null): LinesAmount {
  return { formatted: formatLines(language, lines, estimatedLines), count: Math.round(lines) };
}

export function codeAndTestsLines(language: Language, totals: Pick<EffectTotals, "deferredLines" | "deferredTestLines" | "estimatedLines">): CodeAndTestsLines {
  return {
    code: formatLines(language, deferredCodeLines(totals), totals.estimatedLines),
    tests: formatLines(language, totals.deferredTestLines, totals.estimatedLines),
  };
}

export function summarizePending(language: Language, openTasks: number, estimatedLines: number): PendingEstimate {
  return {
    openTasks,
    estimated: { formatted: formatEstimate(language, estimatedLines), count: Math.round(estimatedLines) },
    perTask: formatEstimate(language, estimatedLines / openTasks),
  };
}
