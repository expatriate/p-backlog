import { useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "../../core/i18n/format";
import type { Language } from "../../core/i18n/language";
import type { CostDay } from "../../core/stats/types";
import { sum } from "../../core/stats/numbers";
import { useLanguage, useMessages } from "../i18n";
import { ChartFrame, type LegendItem } from "./charts/ChartFrame";
import { axisDay, compactNumber, tooltipDay } from "./charts/chart-format";
import { AXIS_PROPS, DASHED_LINE_WIDTH, BAR_RADIUS, LINE_WIDTH, DASHED_LINE, CHART_MARGIN, DATE_AXIS_PROPS, TOOLTIP_PROPS, VALUE_AXIS_WIDTH } from "./charts/chart-style";
import { rowTooltip } from "./charts/ChartTooltip";
import { nonZeroDot } from "./charts/value-dot";
import { costValue } from "./cost-format";
import { formatLines } from "./effect-format";
import type { StatsMessages } from "./messages.ru";
import { Panel } from "./Panel";

const HOOK_TOKENS = "var(--chart-bar-warm)";
const CLI_TOKENS = "var(--chart-bar-neutral)";
const HOOK_RUNS = "var(--chart-line-green)";
const OTHER_RUNS = "var(--chart-line-yellow)";

function dayTooltip(stats: StatsMessages, language: Language) {
  return rowTooltip((day: CostDay) => ({
    title: tooltipDay(language, day.day),
    rows: [
      { label: stats.hookTurnsTooltip, value: stats.tokens(day.hookTokens), shape: "bar", color: HOOK_TOKENS },
      { label: stats.cliOutput, value: stats.tokens(day.cliTokens), shape: "bar", color: CLI_TOKENS },
      { label: stats.apiPriceTooltip, value: costValue(language, day.cost) },
      { label: stats.hookRuns, value: formatLines(language, day.hookRuns), shape: "line", color: HOOK_RUNS },
      { label: stats.otherCommands, value: formatLines(language, day.cliRuns), shape: "dashed", color: OTHER_RUNS },
    ],
  }));
}

export function SpendPanel({ days }: { days: CostDay[] }) {
  const { stats } = useMessages();
  const language = useLanguage();
  const tooltip = useMemo(() => dayTooltip(stats, language), [stats, language]);
  const legend: LegendItem[] = [
    { label: stats.hookTurnTokens, shape: "bar", color: HOOK_TOKENS },
    { label: stats.cliOutputTokens, shape: "bar", color: CLI_TOKENS },
    { label: stats.hookRuns, shape: "line", color: HOOK_RUNS },
    { label: stats.otherCommands, shape: "dashed", color: OTHER_RUNS },
  ];
  const compact = (value: number) => compactNumber(language, value);
  return (
    <Panel title={stats.spendByDay}>
      <ChartFrame summary={spendSummary(stats, language, days)} legend={legend}>
        <ComposedChart data={days} margin={CHART_MARGIN} aria-label={stats.chartLabel(stats.spendByDay, "day")}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="day" tickFormatter={(day: string) => axisDay(language, day)} {...DATE_AXIS_PROPS} />
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

function spendSummary(stats: StatsMessages, language: Language, days: CostDay[]): string {
  const total = (pick: (day: CostDay) => number) => sum(days.map(pick));
  const lines = (value: number) => formatLines(language, value);
  return stats.spendSummary({
    dayCount: days.length,
    hookTokens: total((day) => day.hookTokens),
    cliTokens: lines(total((day) => day.cliTokens)),
    money: formatMoney(language, totalMoney(days)),
    hookRuns: lines(total((day) => day.hookRuns)),
    cliRuns: lines(total((day) => day.cliRuns)),
  });
}

function totalMoney(days: CostDay[]): number | null {
  if (days.every((day) => day.cost === null)) return null;
  return sum(days.map((day) => day.cost ?? 0));
}
