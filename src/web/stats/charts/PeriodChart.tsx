import { useId, type ReactElement } from "react";
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis, type YAxisProps } from "recharts";
import { formatDay } from "../../../core/i18n/format";
import { useLanguage, useMessages } from "../../i18n";
import { ChartFrame } from "./ChartFrame";
import { axisDay, axisTime, compactNumber, tooltipTime } from "./chart-format";
import {
  AREA_FILL_OPACITY,
  AXIS_PROPS,
  BAR_RADIUS,
  CHART_MARGIN,
  DASHED_LINE,
  DASHED_LINE_WIDTH,
  DATE_AXIS_PROPS,
  HATCH_SIZE,
  HATCH_STROKE_WIDTH,
  HOVER_CURSOR,
  LINE_WIDTH,
  VALUE_AXIS_WIDTH,
  type ChartStep,
  type Grain,
} from "./chart-style";
import { SeriesTooltip } from "./ChartTooltip";
import { isPlotted, type Series, type SeriesEntry } from "./series";
import { nonZeroDot, valueDot } from "./value-dot";

const LEFT_AXIS = "left";

type ValueAxis = Pick<YAxisProps, "allowDecimals" | "tickFormatter" | "domain">;

type ChartProps<Row> = { name: string; summary: string; data: Row[]; series: SeriesEntry<Row>[]; axes?: { left?: ValueAxis; right?: ValueAxis } };

type TimeChartProps<Row> = ChartProps<Row> & { step: ChartStep; timeKey: string; tick: (time: string) => string; tooltipTitle: (row: Row) => string };

export function PeriodChart<Row extends { start: string }>({ grain, ...chart }: ChartProps<Row> & { grain: Grain }) {
  const { stats } = useMessages();
  const language = useLanguage();
  const tooltipTitle = (row: Row) => stats.periodOf(grain, formatDay(language, row.start));
  return <TimeChart {...chart} step={grain} timeKey="start" tick={(day) => axisDay(language, day)} tooltipTitle={tooltipTitle} />;
}

export function SampleChart<Row extends { at: string }>(chart: ChartProps<Row>) {
  const language = useLanguage();
  const tooltipTitle = (row: Row) => tooltipTime(language, row.at);
  return <TimeChart {...chart} step="sample" timeKey="at" tick={(at) => axisTime(language, at)} tooltipTitle={tooltipTitle} />;
}

function TimeChart<Row>({ name, summary, data, series, axes = {}, step, timeKey, tick, tooltipTitle }: TimeChartProps<Row>) {
  const { stats } = useMessages();
  const language = useLanguage();
  const patternPrefix = useId();
  const plotted = series.filter(isPlotted);
  const hatched = plotted.filter((entry) => entry.shape === "hatch");
  const patternId = (entry: Series<Row>) => `${patternPrefix}${entry.key}`;
  const isStackTop = (entry: Series<Row>) => entry.stack === undefined || plotted.findLast((other) => other.stack === entry.stack) === entry;
  const hasRightAxis = plotted.some((entry) => entry.axis === "right");
  const compact = (value: number) => compactNumber(language, value);
  const sampled = step === "sample";
  // recharts draws the hover band only in BarChart and renders Area only in AreaChart or ComposedChart
  const Chart = sampled ? ComposedChart : BarChart;

  const mark = (entry: Series<Row>): ReactElement => {
    const yAxisId = entry.axis ?? LEFT_AXIS;
    if (entry.shape === "bar" || entry.shape === "hatch") {
      const fill = entry.shape === "hatch" ? `url(#${patternId(entry)})` : entry.color;
      const stacking = entry.stack === undefined ? {} : { stackId: entry.stack };
      return <Bar key={entry.key} yAxisId={yAxisId} dataKey={entry.key} {...stacking} fill={fill} radius={isStackTop(entry) ? BAR_RADIUS : 0} isAnimationActive={false} />;
    }
    const stroke = entry.shape === "dashed" ? { strokeWidth: DASHED_LINE_WIDTH, strokeDasharray: DASHED_LINE } : { strokeWidth: LINE_WIDTH };
    if (sampled) {
      const fill = entry.shape === "dashed" ? { fill: "none" } : { fill: entry.color, fillOpacity: AREA_FILL_OPACITY };
      return <Area key={entry.key} yAxisId={yAxisId} dataKey={entry.key} stroke={entry.color} {...stroke} {...fill} dot={false} isAnimationActive={false} />;
    }
    const sparse = entry.sparse === true;
    const dot = sparse ? valueDot(entry.color) : nonZeroDot(entry.color);
    return <Line key={entry.key} yAxisId={yAxisId} type={sparse ? "monotone" : "linear"} dataKey={entry.key} stroke={entry.color} {...stroke} connectNulls={sparse} dot={dot} isAnimationActive={false} />;
  };

  return (
    <ChartFrame summary={summary} legend={plotted}>
      <Chart data={data} margin={CHART_MARGIN} aria-label={stats.chartLabel(name, step)}>
        {hatched.length > 0 && (
          <defs>
            {hatched.map((entry) => (
              <pattern key={entry.key} id={patternId(entry)} width={HATCH_SIZE} height={HATCH_SIZE} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width={HATCH_SIZE} height={HATCH_SIZE} fill="var(--surface-raised)" />
                <line x1={0} y1={0} x2={0} y2={HATCH_SIZE} stroke={entry.color} strokeWidth={HATCH_STROKE_WIDTH} />
              </pattern>
            ))}
          </defs>
        )}
        <CartesianGrid vertical={false} yAxisId={LEFT_AXIS} />
        <XAxis dataKey={timeKey} tickFormatter={tick} {...DATE_AXIS_PROPS} />
        <YAxis yAxisId={LEFT_AXIS} tickFormatter={compact} {...axes.left} width={VALUE_AXIS_WIDTH} {...AXIS_PROPS} />
        {hasRightAxis && <YAxis yAxisId="right" orientation="right" tickFormatter={compact} {...axes.right} width={VALUE_AXIS_WIDTH} {...AXIS_PROPS} />}
        <Tooltip content={<SeriesTooltip title={tooltipTitle} series={series} />} isAnimationActive={false} cursor={HOVER_CURSOR} />
        {plotted.map(mark)}
      </Chart>
    </ChartFrame>
  );
}
