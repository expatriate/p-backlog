import { Bar, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, NBSP, pluralCount } from "../../core/stats/format";
import type { CostDay } from "../../core/stats/types";
import { ChartFrame, type LegendItem } from "./charts/ChartFrame";
import { axisDay, compactNumber, tooltipDay } from "./charts/chart-format";
import { AXIS_PROPS, DASHED_LINE_WIDTH, BAR_RADIUS, LINE_WIDTH, DASHED_LINE, CHART_MARGIN, chartTitle, DATE_AXIS_PROPS, TOOLTIP_PROPS, VALUE_AXIS_WIDTH } from "./charts/chart-style";
import { rowTooltip } from "./charts/ChartTooltip";
import { nonZeroDot } from "./charts/value-dot";
import { sum } from "./cost-format";
import { formatLines } from "./effect-format";
import { Panel } from "./Panel";

const HOOK_TOKENS = "var(--chart-bar-warm)";
const CLI_TOKENS = "var(--chart-bar-neutral)";
const HOOK_RUNS = "var(--chart-line-green)";
const OTHER_RUNS = "var(--chart-line-yellow)";

const LEGEND: LegendItem[] = [
  { label: "токены ходов хука", shape: "bar", color: HOOK_TOKENS },
  { label: "токены вывода CLI и скилла", shape: "bar", color: CLI_TOKENS },
  { label: "запуски хука", shape: "line", color: HOOK_RUNS },
  { label: "другие команды", shape: "dashed", color: OTHER_RUNS },
];

const dayTooltip = rowTooltip((day: CostDay) => ({
  title: tooltipDay(day.day),
  rows: [
    { label: "ходы хука", value: pluralCount(day.hookTokens, "токен", "токена", "токенов"), shape: "bar", color: HOOK_TOKENS },
    { label: "вывод CLI и скилл", value: pluralCount(day.cliTokens, "токен", "токена", "токенов"), shape: "bar", color: CLI_TOKENS },
    { label: "по ценам API", value: day.cost === null ? "—" : `≈${NBSP}${formatMoney(day.cost)}` },
    { label: "запуски хука", value: formatLines(day.hookRuns), shape: "line", color: HOOK_RUNS },
    { label: "другие команды", value: formatLines(day.cliRuns), shape: "dashed", color: OTHER_RUNS },
  ],
}));

export function SpendPanel({ days }: { days: CostDay[] }) {
  return (
    <Panel title="Расход по дням">
      <ChartFrame summary={spendSummary(days)} legend={LEGEND}>
        <ComposedChart data={days} margin={CHART_MARGIN} title={chartTitle("Расход по дням", "дням")}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="day" tickFormatter={axisDay} {...DATE_AXIS_PROPS} />
          <YAxis yAxisId="tokens" tickFormatter={compactNumber} width={VALUE_AXIS_WIDTH} {...AXIS_PROPS} />
          <YAxis yAxisId="runs" orientation="right" allowDecimals={false} tickFormatter={compactNumber} width={VALUE_AXIS_WIDTH} {...AXIS_PROPS} />
          <Tooltip content={dayTooltip} {...TOOLTIP_PROPS} />
          <Bar yAxisId="tokens" dataKey="hookTokens" stackId="tokens" fill={HOOK_TOKENS} isAnimationActive={false} />
          <Bar yAxisId="tokens" dataKey="cliTokens" stackId="tokens" fill={CLI_TOKENS} radius={BAR_RADIUS} isAnimationActive={false} />
          <Line yAxisId="runs" dataKey="hookRuns" stroke={HOOK_RUNS} strokeWidth={LINE_WIDTH} dot={nonZeroDot(HOOK_RUNS)} isAnimationActive={false} />
          <Line yAxisId="runs" dataKey="cliRuns" stroke={OTHER_RUNS} strokeWidth={DASHED_LINE_WIDTH} strokeDasharray={DASHED_LINE} dot={nonZeroDot(OTHER_RUNS)} isAnimationActive={false} />
        </ComposedChart>
      </ChartFrame>
    </Panel>
  );
}

function spendSummary(days: CostDay[]): string {
  const hookTokens = sum(days.map((day) => day.hookTokens));
  const cliTokens = sum(days.map((day) => day.cliTokens));
  const hookRuns = sum(days.map((day) => day.hookRuns));
  const cliRuns = sum(days.map((day) => day.cliRuns));
  return `За ${pluralCount(days.length, "день", "дня", "дней")}: из-за хука ${pluralCount(hookTokens, "токен", "токена", "токенов")}, вывод CLI и скилл ${formatLines(cliTokens)}, ≈${NBSP}${formatMoney(totalMoney(days))}; запусков хука ${formatLines(hookRuns)}, других команд ${formatLines(cliRuns)}`;
}

function totalMoney(days: CostDay[]): number | null {
  if (days.every((day) => day.cost === null)) return null;
  return days.reduce((total, day) => total + (day.cost ?? 0), 0);
}
