import { useMemo } from "react";
import type { CostDay, CostPeriod, GrainPeriods } from "../../core/api/contract";
import { useLanguage, useMessages } from "../i18n";
import { COUNT_AXIS } from "./charts/chart-style";
import { PeriodChart } from "./charts/PeriodChart";
import type { SeriesEntry } from "./charts/series";
import { Panel } from "./Panel";
import { summarizeSpend } from "./summaries";
import { useGrainPanel } from "./use-grain-panel";
import { costValue, wholeFormatter } from "./value-format";

const HOOK_TOKENS = "var(--chart-bar-warm)";
const CLI_TOKENS = "var(--chart-bar-neutral)";
const HOOK_RUNS = "var(--chart-line-green)";
const OTHER_RUNS = "var(--chart-line-yellow)";

function dayPeriod({ day, ...numbers }: CostDay): CostPeriod {
  return { start: day, ...numbers };
}

export function SpendPanel({ weeks, days, windows }: { weeks: CostPeriod[]; days: CostDay[]; windows: GrainPeriods }) {
  const { stats } = useMessages();
  const language = useLanguage();
  const dayPeriods = useMemo(() => days.map(dayPeriod), [days]);
  const { grain, periods, period, toggle } = useGrainPanel("spend", "day", { weeks, days: dayPeriods }, windows);
  const title = stats.spendBy[grain];
  const whole = wholeFormatter(language);
  const series: SeriesEntry<CostPeriod>[] = [
    { key: "hookTokens", label: stats.hookTurnTokens, tooltipLabel: stats.hookTurnsTooltip, shape: "bar", color: HOOK_TOKENS, stack: "tokens", format: stats.tokens },
    { key: "cliTokens", label: stats.cliOutputTokens, tooltipLabel: stats.cliOutput, shape: "bar", color: CLI_TOKENS, stack: "tokens", format: stats.tokens },
    { label: stats.apiPriceTooltip, format: (row) => (row.hasUnpricedTokens && row.cost !== null ? `${costValue(language, row.cost)} (${stats.unpricedNote})` : costValue(language, row.cost)) },
    { key: "hookRuns", label: stats.hookRuns, shape: "line", color: HOOK_RUNS, axis: "right", format: whole },
    { key: "cliRuns", label: stats.otherCommands, shape: "dashed", color: OTHER_RUNS, axis: "right", format: whole },
  ];
  return (
    <Panel title={title} period={period} aside={toggle}>
      <PeriodChart name={title} grain={grain} summary={stats.spendSummary(summarizeSpend(language, grain, periods))} data={periods} series={series} axes={{ right: COUNT_AXIS }} />
    </Panel>
  );
}
