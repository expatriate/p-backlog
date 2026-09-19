import { COST_TOTALS_DAYS } from "../../core/stats/cost/cost-report";
import { formatMoney } from "../../core/stats/format";
import type { CostCommand, CostDay, CostModel, CostTotals } from "../../core/stats/types";
import { costValue, formatMb, formatMs } from "./cost-format";
import { formatLines } from "./effect-format";
import { Figure } from "./Figure";
import flowStyles from "./FlowPanels.module.css";
import { Panel } from "./Panel";
import tableStyles from "./QualityPanels.module.css";
import totalsStyles from "./StatsPage.module.css";

export function CostFigures({ totals, days, models }: { totals: CostTotals; days: CostDay[]; models: CostModel[] }) {
  const lastWeek = days.slice(-COST_TOTALS_DAYS);
  const hookTokens = sum(lastWeek.map((day) => day.hookTokens));
  const cliTokens = sum(lastWeek.map((day) => day.cliTokens));
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

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
