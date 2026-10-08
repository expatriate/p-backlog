import type { AccuracyPeriod, EffectTotals, FlowPeriod } from "../../core/api/contract";
import type { Language } from "../../core/i18n/language";
import { sum } from "../../core/numbers";
import { formatShare } from "../../core/stats/format";
import type { Grain } from "./charts/chart-style";
import { deferredCodeLines, formatLines } from "./effect-format";

export type IntakeSummary = { grain: Grain; periodCount: number; created: number; perPeriod: number | null };

export type AccuracySummary = { grain: Grain; periodCount: number; decided: number; latestPrecision: string | null };

export type LinesAmount = { formatted: string; count: number };

export type CodeAndTestsLines = { code: string; tests: string };

export type PendingEstimate = { openTasks: number; estimated: LinesAmount; perTask: string };

export function summarizeIntake(grain: Grain, periods: FlowPeriod[]): IntakeSummary {
  const created = sum(periods.map((period) => period.created));
  return { grain, periodCount: periods.length, created, perPeriod: created === 0 ? null : created / periods.length };
}

export function summarizeAccuracy(grain: Grain, periods: AccuracyPeriod[]): AccuracySummary {
  const latest = periods.filter((period) => period.precision !== null).at(-1);
  return {
    grain,
    periodCount: periods.length,
    decided: sum(periods.map((period) => period.decided)),
    latestPrecision: latest === undefined ? null : formatShare(latest.precision),
  };
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
