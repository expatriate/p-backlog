import { forecastTail, forecastText, formatDays, formatSigned } from "../core/stats/format";
import type { FlowForecast, Signal, StatsTotals } from "../core/stats/types";

export type StatsSummary = { scopeName: string; totals: StatsTotals; forecast: FlowForecast; signals: Signal[]; url: string };

export function statsSummary({ scopeName, totals, forecast, signals, url }: StatsSummary): string {
  const net = totals.createdLastWeek - totals.closedLastWeek;
  const tail = totals.leadTimeP90Days === null ? "" : ` (90% — за ${formatDays(totals.leadTimeP90Days)})`;
  return [
    `${scopeName} · статистика`,
    `Открыто: ${totals.open} (вес ${totals.openWeight}) · за неделю: ${formatSigned(net)} (создано ${totals.createdLastWeek}, закрыто ${totals.closedLastWeek})`,
    `Возраст, медиана: ${formatDays(totals.ageMedianDays)} · до закрытия, медиана: ${formatDays(totals.leadTimeMedianDays)}${tail}`,
    `Прогноз: ${forecastText(forecast)} (${forecastTail(forecast)})`,
    ...(signals.length === 0 ? ["Тревог нет"] : ["Тревоги:", ...signals.map((signal) => `- ${signal.text}`)]),
    `Подробнее: ${url}`,
  ].join("\n");
}
