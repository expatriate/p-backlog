import type { Language } from "../core/i18n/language";
import { coreMessages } from "../core/messages";
import { formatDays, formatP90, formatSigned } from "../core/stats/format";
import type { FlowForecast, Signal, StatsTotals } from "../core/stats/types";

export type StatsSummary = { language: Language; scopeName: string; totals: StatsTotals; forecast: FlowForecast; signals: Signal[]; url: string };

export function statsSummary({ language, scopeName, totals, forecast, signals, url }: StatsSummary): string {
  const messages = coreMessages(language);
  const net = totals.createdLastWeek - totals.closedLastWeek;
  const tail = totals.leadTimeP90Days === null ? "" : ` (90% — ${formatP90(totals.leadTimeP90Days)})`;
  return [
    `${scopeName} · статистика`,
    `Открыто: ${totals.open} (вес ${totals.openWeight}) · за неделю: ${formatSigned(net)} (создано ${totals.createdLastWeek}, закрыто ${totals.closedLastWeek})`,
    `Возраст, медиана: ${formatDays(totals.ageMedianDays)} · до закрытия, медиана: ${formatDays(totals.leadTimeMedianDays)}${tail}`,
    `Прогноз: ${messages.forecast(forecast)} (${messages.forecastTail(forecast)})`,
    ...(signals.length === 0 ? ["Тревог нет"] : ["Тревоги:", ...signals.map((signal) => `- ${messages.signal(signal)}`)]),
    `Подробнее: ${url}`,
  ].join("\n");
}
