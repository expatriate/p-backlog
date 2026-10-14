import type { AccuracyPeriod, CostPeriod, EffectTotals, FlowPeriod } from "../../core/api/contract";
import { formatMoney } from "../../core/i18n/format";
import type { Language } from "../../core/i18n/language";
import { sum } from "../../core/numbers";
import { formatShare } from "../../core/stats/format";
import type { Grain } from "./charts/chart-style";
import { deferredCodeLines, formatLines } from "./effect-format";
import { approx, wholeFormatter } from "./value-format";

type PeriodSummary = { grain: Grain; periodCount: number };

export type FlowSummary = PeriodSummary & { created: number; closed: number; openNow: number };

export type IntakeSummary = PeriodSummary & { created: number; perPeriod: number | null };

export type AccuracySummary = PeriodSummary & { decided: number; latestPrecision: string | null };

export type SpendSummary = PeriodSummary & { hookTokens: number; cliTokens: string; approxMoney: string; hookRuns: string; cliRuns: string };

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

export function summarizeIntake(grain: Grain, periods: FlowPeriod[]): IntakeSummary {
  const created = sum(periods.map((period) => period.created));
  return { ...periodSummary(grain, periods), created, perPeriod: created === 0 ? null : created / periods.length };
}

export function summarizeAccuracy(grain: Grain, periods: AccuracyPeriod[]): AccuracySummary {
  const latest = periods.filter((period) => period.precision !== null).at(-1);
  return {
    ...periodSummary(grain, periods),
    decided: sum(periods.map((period) => period.decided)),
    latestPrecision: latest === undefined ? null : formatShare(latest.precision),
  };
}

export function summarizeSpend(language: Language, grain: Grain, periods: CostPeriod[]): SpendSummary {
  const total = (pick: (period: CostPeriod) => number) => sum(periods.map(pick));
  const whole = wholeFormatter(language);
  return {
    ...periodSummary(grain, periods),
    hookTokens: total((period) => period.hookTokens),
    cliTokens: whole(total((period) => period.cliTokens)),
    approxMoney: approx(formatMoney(language, totalMoney(periods))),
    hookRuns: whole(total((period) => period.hookRuns)),
    cliRuns: whole(total((period) => period.cliRuns)),
  };
}

function totalMoney(periods: CostPeriod[]): number | null {
  if (periods.every((period) => period.cost === null)) return null;
  return sum(periods.map((period) => period.cost ?? 0));
}

export function linesAmount(language: Language, lines: number, estimatedPart: number | null = null): LinesAmount {
  return { formatted: formatLines(language, lines, estimatedPart), count: Math.round(lines) };
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
    estimated: linesAmount(language, estimatedLines, estimatedLines),
    perTask: formatLines(language, estimatedLines / openTasks, estimatedLines),
  };
}
