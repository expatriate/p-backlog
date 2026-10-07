import type { ReportPeriod } from "../../core/api/contract";
import { formatDayRange } from "../../core/i18n/format";
import { useLanguage, useMessages } from "../i18n";
import type { StatsMessages } from "./messages.ru";

type PeriodWindow = keyof StatsMessages["periodWindows"];

type PeriodCaption = {
  of: (window: PeriodWindow, period: ReportPeriod) => string;
  labelled: (label: string, period: ReportPeriod) => string;
};

export function usePeriodCaption(): PeriodCaption {
  const { stats } = useMessages();
  const language = useLanguage();
  const labelled = (label: string, period: ReportPeriod) => stats.periodCaption(label, formatDayRange(language, period.from, period.to));
  const of = (window: PeriodWindow, period: ReportPeriod) => labelled(stats.periodWindows[window], period);
  return { of, labelled };
}
