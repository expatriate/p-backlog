import type { Language } from "../core/i18n/language";
import { coreMessages } from "../core/messages";
import { formatDays, formatP90, formatSigned } from "../core/stats/format";
import type { FlowForecast, Signal, StatsTotals } from "../core/stats/types";
import { cliMessages } from "./messages";

export type StatsSummary = { language: Language; scopeName: string; totals: StatsTotals; forecast: FlowForecast; signals: Signal[]; url: string };

export function statsSummary({ language, scopeName, totals, forecast, signals, url }: StatsSummary): string {
  const messages = coreMessages(language);
  const cli = cliMessages(language);
  const net = totals.createdLastWeek - totals.closedLastWeek;
  const tail = totals.leadTimeP90Days === null ? "" : cli.statsP90Tail(formatP90(totals.leadTimeP90Days));
  return [
    cli.statsTitle(scopeName),
    cli.statsOpenLine({ open: totals.open, weight: totals.openWeight, net: formatSigned(net), created: totals.createdLastWeek, closed: totals.closedLastWeek }),
    cli.statsAgeLine(formatDays(totals.ageMedianDays), formatDays(totals.leadTimeMedianDays), tail),
    cli.statsForecastLine(messages.forecast(forecast), messages.forecastTail(forecast)),
    ...(signals.length === 0 ? [cli.noAlerts] : [cli.alertsHeader, ...signals.map((signal) => `- ${messages.signal(signal)}`)]),
    cli.moreAt(url),
  ].join("\n");
}
