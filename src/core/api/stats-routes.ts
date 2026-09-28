import type { CodeReport, CostReport, EffectReport, QualityReport, SignalsReport, StatsReport } from "./contract";

export type StatsReports = { overview: StatsReport; code: CodeReport; effect: EffectReport; quality: QualityReport; signals: SignalsReport; cost: CostReport };

export type StatsReportKind = keyof StatsReports;

export const STATS_REPORT_ROUTES: Record<StatsReportKind, string> = {
  overview: "/stats",
  code: "/stats/code",
  effect: "/stats/effect",
  quality: "/stats/quality",
  signals: "/stats/signals",
  cost: "/stats/cost",
};

export const STATS_MEMORY_ROUTE = "/stats/memory";
