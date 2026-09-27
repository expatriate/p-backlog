import type { ReportPeriod } from "../../core/api/contract";
import { formatDayRange } from "../../core/i18n/format";
import { useLanguage, useMessages } from "../i18n";
import type { Grain } from "./charts/chart-style";

export type PeriodWindow = "weeks" | "days" | "lastWeek" | "churn";

export function grainWindow(grain: Grain): "weeks" | "days" {
  return grain === "week" ? "weeks" : "days";
}

export function usePeriodCaption(): (window: PeriodWindow, period: ReportPeriod) => string {
  const { stats } = useMessages();
  const language = useLanguage();
  return (window, period) => stats.periodCaption(stats.periodWindows[window], formatDayRange(language, period.from, period.to));
}
