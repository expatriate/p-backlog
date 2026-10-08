import { formatShare } from "../../core/stats/format";
import type { AccuracyPeriod } from "../../core/api/contract";
import { useLanguage, useMessages } from "../i18n";
import type { Grain } from "./charts/chart-style";
import { PeriodChart } from "./charts/PeriodChart";
import type { SeriesEntry } from "./charts/series";
import { summarizeAccuracy } from "./summaries";
import { formatWhole } from "./value-format";

const DECIDED = "var(--chart-bar-neutral)";
const PRECISION = "var(--chart-line-green)";

export function AccuracyChart({ periods, grain }: { periods: AccuracyPeriod[]; grain: Grain }) {
  const { stats } = useMessages();
  const language = useLanguage();
  const series: SeriesEntry<AccuracyPeriod>[] = [
    { key: "decided", label: stats.decidedCandidates, shape: "bar", color: DECIDED, format: (decided) => formatWhole(language, decided) },
    { key: "precision", label: stats.precision, shape: "line", color: PRECISION, axis: "right", sparse: true, format: formatShare },
  ];
  return (
    <PeriodChart
      name={stats.accuracyTitle}
      grain={grain}
      summary={stats.accuracySummary(summarizeAccuracy(grain, periods))}
      data={periods}
      series={series}
      axes={{ left: { allowDecimals: false }, right: { domain: [0, 1], tickFormatter: formatShare } }}
    />
  );
}
