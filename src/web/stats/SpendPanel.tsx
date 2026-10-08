import { useMemo } from "react";
import { formatMoney } from "../../core/i18n/format";
import type { Language } from "../../core/i18n/language";
import type { CostDay, CostPeriod, GrainPeriods } from "../../core/api/contract";
import { sum } from "../../core/numbers";
import { useLanguage, useMessages } from "../i18n";
import { compactNumber } from "./charts/chart-format";
import type { Grain } from "./charts/chart-style";
import { PeriodChart } from "./charts/PeriodChart";
import type { SeriesEntry } from "./charts/series";
import type { StatsMessages } from "./messages.ru";
import { Panel } from "./Panel";
import { useGrainPanel } from "./use-grain-panel";
import { approx, costValue, formatWhole } from "./value-format";

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
  const whole = (value: number) => formatWhole(language, value);
  const compact = (value: number) => compactNumber(language, value);
  const series: SeriesEntry<CostPeriod>[] = [
    { key: "hookTokens", label: stats.hookTurnTokens, tooltipLabel: stats.hookTurnsTooltip, shape: "bar", color: HOOK_TOKENS, stack: "tokens", format: stats.tokens },
    { key: "cliTokens", label: stats.cliOutputTokens, tooltipLabel: stats.cliOutput, shape: "bar", color: CLI_TOKENS, stack: "tokens", format: stats.tokens },
    { label: stats.apiPriceTooltip, format: (row) => (row.hasUnpricedTokens && row.cost !== null ? `${costValue(language, row.cost)} (${stats.unpricedNote})` : costValue(language, row.cost)) },
    { key: "hookRuns", label: stats.hookRuns, shape: "line", color: HOOK_RUNS, axis: "right", format: whole },
    { key: "cliRuns", label: stats.otherCommands, shape: "dashed", color: OTHER_RUNS, axis: "right", format: whole },
  ];
  return (
    <Panel title={title} period={period} aside={toggle}>
      <PeriodChart
        name={title}
        grain={grain}
        summary={spendSummary(stats, language, grain, periods)}
        data={periods}
        series={series}
        axes={{ left: { tickFormatter: compact }, right: { allowDecimals: false, tickFormatter: compact } }}
      />
    </Panel>
  );
}

function spendSummary(stats: StatsMessages, language: Language, grain: Grain, periods: CostPeriod[]): string {
  const total = (pick: (period: CostPeriod) => number) => sum(periods.map(pick));
  const whole = (value: number) => formatWhole(language, value);
  return stats.spendSummary({
    grain,
    periodCount: periods.length,
    hookTokens: total((period) => period.hookTokens),
    cliTokens: whole(total((period) => period.cliTokens)),
    approxMoney: approx(formatMoney(language, totalMoney(periods))),
    hookRuns: whole(total((period) => period.hookRuns)),
    cliRuns: whole(total((period) => period.cliRuns)),
  });
}

function totalMoney(periods: CostPeriod[]): number | null {
  if (periods.every((period) => period.cost === null)) return null;
  return sum(periods.map((period) => period.cost ?? 0));
}
