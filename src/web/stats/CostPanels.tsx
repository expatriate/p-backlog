import { COST_TOTALS_DAYS } from "../../core/stats/cost/cost-report";
import { formatDayMonth, formatMoney, NBSP, pluralCount } from "../../core/stats/format";
import type { CostCommand, CostDay, CostModel, CostTotals } from "../../core/stats/types";
import { costValue, formatMb, formatMs } from "./cost-format";
import { formatLines } from "./effect-format";
import { Figure } from "./Figure";
import flowStyles from "./FlowPanels.module.css";
import { Panel } from "./Panel";
import tableStyles from "./QualityPanels.module.css";
import styles from "./CostPanels.module.css";
import totalsStyles from "./StatsPage.module.css";

const WIDTH = 360;
const HEIGHT = 96;

export function CostFigures({ totals, days, models }: { totals: CostTotals; days: CostDay[]; models: CostModel[] }) {
  const window = days.slice(-COST_TOTALS_DAYS);
  const hookTokens = sum(window.map((day) => day.hookTokens));
  const cliTokens = sum(window.map((day) => day.cliTokens));
  const unknownPrice = models.some((model) => model.cost === null && model.tokens > 0);
  return (
    <div className={totalsStyles.totals}>
      <Figure label="Токены из-за беклога" value={formatLines(totals.tokens)} note={`ходы хука ${formatLines(hookTokens)}, вывод CLI и скилл ${formatLines(cliTokens)}`} />
      <Figure label="По ценам API" value={costValue(totals.cost)} note={unknownPrice ? "без моделей с неизвестной ценой" : ""} />
      <Figure label="Ходов из-за хука" value={formatLines(totals.hookTurns)} note={`запусков хука ${formatLines(totals.hookRuns)}`} />
      <Figure label="Вызовов CLI" value={formatLines(totals.cliRuns)} note="" />
    </div>
  );
}

export function TokensChartPanel({ days }: { days: CostDay[] }) {
  const hookTokens = sum(days.map((day) => day.hookTokens));
  const cliTokens = sum(days.map((day) => day.cliTokens));
  const cost = totalMoney(days);
  const summary = `${pluralCount(days.length, "день", "дня", "дней")}: из-за хука ${pluralCount(hookTokens, "токен", "токена", "токенов")}, вывод CLI и скилл ${formatLines(cliTokens)}, ≈${NBSP}${formatMoney(cost)}`;
  return (
    <Panel title="Токены по дням">
      <DayBars
        rows={days.map((day) => ({ day: day.day, primary: day.hookTokens, secondary: day.cliTokens }))}
        summary={summary}
        legendPrimary="ходы хука"
        legendSecondary="вывод CLI и скилла"
      />
    </Panel>
  );
}

export function RunsChartPanel({ days }: { days: CostDay[] }) {
  const hookRuns = sum(days.map((day) => day.hookRuns));
  const cliRuns = sum(days.map((day) => day.cliRuns));
  const summary = `${pluralCount(days.length, "день", "дня", "дней")}: запусков хука ${formatLines(hookRuns)}, других команд ${formatLines(cliRuns)}`;
  return (
    <Panel title="Вызовы по дням">
      <DayBars rows={days.map((day) => ({ day: day.day, primary: day.hookRuns, secondary: day.cliRuns }))} summary={summary} legendPrimary="хука" legendSecondary="других команд" />
    </Panel>
  );
}

export function ModelsPanel({ models }: { models: CostModel[] }) {
  return (
    <Panel title="По моделям">
      {models.length === 0 ? (
        <p className={flowStyles.muted}>Моделей пока нет</p>
      ) : (
        <div className={tableStyles.scroll} tabIndex={0} role="region" aria-label="Таблица «По моделям»">
          <table className={tableStyles.table} aria-label="По моделям">
            <thead>
              <tr>
                <th scope="col">Модель</th>
                <th scope="col">Токены</th>
                <th scope="col">По ценам API</th>
              </tr>
            </thead>
            <tbody>
              {models.map((model) => (
                <tr key={model.model}>
                  <th scope="row">{model.model}</th>
                  <td>{formatLines(model.tokens)}</td>
                  <td>{formatMoney(model.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

export function CommandsPanel({ commands }: { commands: CostCommand[] }) {
  return (
    <Panel title="Команды">
      {commands.length === 0 ? (
        <p className={flowStyles.muted}>Команд пока не было</p>
      ) : (
        <div className={tableStyles.scroll} tabIndex={0} role="region" aria-label="Таблица «Команды»">
          <table className={tableStyles.table} aria-label="Команды">
            <thead>
              <tr>
                <th scope="col">Команда</th>
                <th scope="col">Запусков</th>
                <th scope="col">Среднее время</th>
                <th scope="col">Средняя память</th>
                <th scope="col">Пиковая память</th>
              </tr>
            </thead>
            <tbody>
              {commands.map((command) => (
                <tr key={command.command}>
                  <th scope="row">{command.command}</th>
                  <td>{formatLines(command.runs)}</td>
                  <td>{formatMs(command.avgMs)}</td>
                  <td>{formatMb(command.avgRssMb)}</td>
                  <td>{formatMb(command.maxRssMb)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function DayBars({
  rows,
  summary,
  legendPrimary,
  legendSecondary,
}: {
  rows: { day: string; primary: number; secondary: number }[];
  summary: string;
  legendPrimary: string;
  legendSecondary: string;
}) {
  const slot = WIDTH / Math.max(rows.length, 1);
  const peak = Math.max(1, ...rows.map((row) => row.primary + row.secondary));
  const height = (value: number) => (value / peak) * HEIGHT;
  const first = rows[0];
  return (
    <figure className={styles.chart}>
      <div role="img" aria-label={summary}>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className={styles.bars} aria-hidden="true">
          {rows.map((row, index) => {
            const primary = height(row.primary);
            const secondary = height(row.secondary);
            const x = index * slot + slot * 0.2;
            return (
              <g key={row.day}>
                <rect className={styles.hook} x={x} y={HEIGHT - primary} width={slot * 0.6} height={primary} />
                <rect className={styles.other} x={x} y={HEIGHT - primary - secondary} width={slot * 0.6} height={secondary} />
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className={styles.caption}>
        <span>{first === undefined ? "" : formatDayMonth(new Date(first.day))} — сейчас</span>
        <span className={styles.legend}>
          <span className={styles.legendHook}>{legendPrimary}</span>
          <span className={styles.legendOther}>{legendSecondary}</span>
        </span>
      </figcaption>
    </figure>
  );
}

function totalMoney(days: CostDay[]): number | null {
  if (days.every((day) => day.cost === null)) return null;
  return days.reduce((total, day) => total + (day.cost ?? 0), 0);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
