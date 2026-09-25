import { useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "../../core/i18n/format";
import type { Language } from "../../core/i18n/language";
import type { CostDay, CostPeriod } from "../../core/api/contract";
import { sum } from "../../core/stats/numbers";
import { useLanguage, useMessages } from "../i18n";
import { ChartFrame, type LegendItem } from "./charts/ChartFrame";
import { axisDay, compactNumber, tooltipDay } from "./charts/chart-format";
import { AXIS_PROPS, DASHED_LINE_WIDTH, BAR_RADIUS, LINE_WIDTH, DASHED_LINE, CHART_MARGIN, DATE_AXIS_PROPS, TOOLTIP_PROPS, VALUE_AXIS_WIDTH, type Grain } from "./charts/chart-style";
import { rowTooltip } from "./charts/ChartTooltip";
import { nonZeroDot } from "./charts/value-dot";
import { costValue } from "./cost-format";
import { formatLines } from "./effect-format";
import { GrainToggle } from "./GrainToggle";
import type { StatsMessages } from "./messages.ru";
import { Panel } from "./Panel";
import { useGrainSeries } from "./use-grain-series";

const HOOK_TOKENS = "var(--chart-bar-warm)";
const CLI_TOKENS = "var(--chart-bar-neutral)";
const HOOK_RUNS = "var(--chart-line-green)";
const OTHER_RUNS = "var(--chart-line-yellow)";

function periodTooltip(stats: StatsMessages, language: Language, grain: Grain) {
  return rowTooltip((period: CostPeriod) => ({
    title: stats.periodOf(grain, tooltipDay(language, period.start)),
    rows: [
      { label: stats.hookTurnsTooltip, value: stats.tokens(period.hookTokens), shape: "bar", color: HOOK_TOKENS },
      { label: stats.cliOutput, value: stats.tokens(period.cliTokens), shape: "bar", color: CLI_TOKENS },
      { label: stats.apiPriceTooltip, value: period.hasUnpricedTokens && period.cost !== null ? `${costValue(language, period.cost)} (${stats.unpricedNote})` : costValue(language, period.cost) },
      { label: stats.hookRuns, value: formatLines(language, period.hookRuns), shape: "line", color: HOOK_RUNS },
      { label: stats.otherCommands, value: formatLines(language, period.cliRuns), shape: "dashed", color: OTHER_RUNS },
    ],
  }));
}

function dayPeriod({ day, ...numbers }: CostDay): CostPeriod {
  return { start: day, ...numbers };
}

export function SpendPanel({ weeks, days }: { weeks: CostPeriod[]; days: CostDay[] }) {
  const { stats } = useMessages();
  const language = useLanguage();
  const dayPeriods = useMemo(() => days.map(dayPeriod), [days]);
  const { grain, periods, setGrain } = useGrainSeries("spend", "day", { week: weeks, day: dayPeriods });
  const tooltip = useMemo(() => periodTooltip(stats, language, grain), [stats, language, grain]);
  const title = stats.spendBy[grain];
  const legend: LegendItem[] = [
    { label: stats.hookTurnTokens, shape: "bar", color: HOOK_TOKENS },
    { label: stats.cliOutputTokens, shape: "bar", color: CLI_TOKENS },
    { label: stats.hookRuns, shape: "line", color: HOOK_RUNS },
    { label: stats.otherCommands, shape: "dashed", color: OTHER_RUNS },
  ];
  const compact = (value: number) => compactNumber(language, value);
  return (
    <Panel title={title} aside={<GrainToggle chart="spend" grain={grain} onChange={setGrain} />}>
      <ChartFrame summary={spendSummary(stats, language, grain, periods)} legend={legend}>
        <ComposedChart data={periods} margin={CHART_MARGIN} aria-label={stats.chartLabel(title, grain)}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="start" tickFormatter={(day: string) => axisDay(language, day)} {...DATE_AXIS_PROPS} />
          <YAxis yAxisId="tokens" tickFormatter={compact} width={VALUE_AXIS_WIDTH} {...AXIS_PROPS} />
          <YAxis yAxisId="runs" orientation="right" allowDecimals={false} tickFormatter={compact} width={VALUE_AXIS_WIDTH} {...AXIS_PROPS} />
          <Tooltip content={tooltip} {...TOOLTIP_PROPS} />
          <Bar yAxisId="tokens" dataKey="hookTokens" stackId="tokens" fill={HOOK_TOKENS} isAnimationActive={false} />
          <Bar yAxisId="tokens" dataKey="cliTokens" stackId="tokens" fill={CLI_TOKENS} radius={BAR_RADIUS} isAnimationActive={false} />
          <Line yAxisId="runs" dataKey="hookRuns" stroke={HOOK_RUNS} strokeWidth={LINE_WIDTH} dot={nonZeroDot(HOOK_RUNS)} isAnimationActive={false} />
          <Line yAxisId="runs" dataKey="cliRuns" stroke={OTHER_RUNS} strokeWidth={DASHED_LINE_WIDTH} strokeDasharray={DASHED_LINE} dot={nonZeroDot(OTHER_RUNS)} isAnimationActive={false} />
        </ComposedChart>
      </ChartFrame>
    </Panel>
  );
}

function spendSummary(stats: StatsMessages, language: Language, grain: Grain, periods: CostPeriod[]): string {
  const total = (pick: (period: CostPeriod) => number) => sum(periods.map(pick));
  const lines = (value: number) => formatLines(language, value);
  return stats.spendSummary({
    grain,
    periodCount: periods.length,
    hookTokens: total((period) => period.hookTokens),
    cliTokens: lines(total((period) => period.cliTokens)),
    money: formatMoney(language, totalMoney(periods)),
    hookRuns: lines(total((period) => period.hookRuns)),
    cliRuns: lines(total((period) => period.cliRuns)),
  });
}

function totalMoney(periods: CostPeriod[]): number | null {
  if (periods.every((period) => period.cost === null)) return null;
  return sum(periods.map((period) => period.cost ?? 0));
}
