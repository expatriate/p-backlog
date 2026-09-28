import type { CoreMessages } from "../core/messages";
import { formatSigned } from "../core/stats/format";
import type { FlowForecast, ReportHead, Signal, StatsTotals } from "../core/stats/types";
import type { CliMessages } from "./messages";

type StatsSummary = {
  cli: CliMessages;
  core: CoreMessages;
  scopeName: string;
  head: Pick<ReportHead, "unparsedTasks" | "invalidJournalLines" | "unknownJournalLines">;
  totals: StatsTotals;
  forecast: FlowForecast;
  signals: Signal[];
  url: string;
};

export function statsSummary({ cli, core, scopeName, head, totals, forecast, signals, url }: StatsSummary): string {
  const net = totals.createdLastWeek - totals.closedLastWeek;
  const tail = totals.leadTimeP90Days === null ? "" : cli.statsP90Tail(core.p90(totals.leadTimeP90Days));
  return [
    cli.statsTitle(scopeName),
    ...(head.unparsedTasks > 0 ? [cli.statsUnparsedTasks(head.unparsedTasks)] : []),
    ...(head.invalidJournalLines > 0 ? [cli.statsInvalidJournalLines(head.invalidJournalLines)] : []),
    ...(head.unknownJournalLines > 0 ? [cli.statsUnknownJournalLines(head.unknownJournalLines)] : []),
    cli.statsOpenLine({ open: totals.open, weight: totals.openWeight, net: formatSigned(net), created: totals.createdLastWeek, closed: totals.closedLastWeek }),
    cli.statsAgeLine(core.days(totals.ageMedianDays), core.days(totals.leadTimeMedianDays), tail),
    cli.statsForecastLine(core.forecast(forecast), core.forecastTail(forecast)),
    ...(signals.length === 0 ? [cli.noAlerts] : [cli.alertsHeader, ...signals.map((signal) => `- ${core.signal(signal)}`)]),
    cli.moreAt(url),
  ].join("\n");
}
