import type { Language } from "../core/i18n/language";
import { coreMessages } from "../core/messages";
import { formatSigned } from "../core/stats/format";
import type { FlowForecast, ReportHead, Signal, StatsTotals } from "../core/stats/types";
import { cliMessages } from "./messages";

export type StatsSummary = {
  language: Language;
  scopeName: string;
  head: Pick<ReportHead, "unparsedTasks" | "invalidJournalLines" | "unknownJournalLines">;
  totals: StatsTotals;
  forecast: FlowForecast;
  signals: Signal[];
  url: string;
};

export function statsSummary({ language, scopeName, head, totals, forecast, signals, url }: StatsSummary): string {
  const messages = coreMessages(language);
  const cli = cliMessages(language);
  const net = totals.createdLastWeek - totals.closedLastWeek;
  const tail = totals.leadTimeP90Days === null ? "" : cli.statsP90Tail(messages.p90(totals.leadTimeP90Days));
  return [
    cli.statsTitle(scopeName),
    ...(head.unparsedTasks > 0 ? [cli.statsUnparsedTasks(head.unparsedTasks)] : []),
    ...(head.invalidJournalLines > 0 ? [cli.statsInvalidJournalLines(head.invalidJournalLines)] : []),
    ...(head.unknownJournalLines > 0 ? [cli.statsUnknownJournalLines(head.unknownJournalLines)] : []),
    cli.statsOpenLine({ open: totals.open, weight: totals.openWeight, net: formatSigned(net), created: totals.createdLastWeek, closed: totals.closedLastWeek }),
    cli.statsAgeLine(messages.days(totals.ageMedianDays), messages.days(totals.leadTimeMedianDays), tail),
    cli.statsForecastLine(messages.forecast(forecast), messages.forecastTail(forecast)),
    ...(signals.length === 0 ? [cli.noAlerts] : [cli.alertsHeader, ...signals.map((signal) => `- ${messages.signal(signal)}`)]),
    cli.moreAt(url),
  ].join("\n");
}
