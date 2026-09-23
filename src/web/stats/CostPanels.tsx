import { COST_TOTALS_DAYS } from "../../core/stats/cost/cost-report";
import { formatMoney } from "../../core/stats/format";
import type { CostCommand, CostDay, CostModel, CostTotals } from "../../core/stats/types";
import { costValue, formatMb, formatMs, sum } from "./cost-format";
import { formatLines } from "./effect-format";
import { Figure } from "./Figure";
import rowStyles from "./PanelRows.module.css";
import { Panel } from "./Panel";
import { StatsTable } from "./StatsTable";
import totalsStyles from "./StatsPage.module.css";

export function CostFigures({ totals, days }: { totals: CostTotals; days: CostDay[] }) {
  const lastWeek = days.slice(-COST_TOTALS_DAYS);
  const hookTokens = sum(lastWeek.map((day) => day.hookTokens));
  const cliTokens = sum(lastWeek.map((day) => day.cliTokens));
  return (
    <div className={totalsStyles.totals}>
      <Figure label="Токены из-за беклога" value={formatLines(totals.tokens)} note={`ходы хука ${formatLines(hookTokens)}, вывод CLI и скилл ${formatLines(cliTokens)}`} />
      <Figure label="По ценам API" value={costValue(totals.cost)} note={totals.hasUnpricedTokens ? "без моделей с неизвестной ценой" : ""} />
      <Figure label="Ходов из-за хука" value={formatLines(totals.hookTurns)} note={`запусков хука ${formatLines(totals.hookRuns)}`} />
      <Figure label="Вызовов CLI" value={formatLines(totals.cliRuns)} note="" />
    </div>
  );
}

export function ModelsPanel({ models }: { models: CostModel[] }) {
  return (
    <Panel title="По моделям">
      {models.length === 0 ? (
        <p className={rowStyles.muted}>Моделей пока нет</p>
      ) : (
        <StatsTable
          label="По моделям"
          head={["Модель", "Токены", "По ценам API"]}
          rows={models.map((model) => ({ key: model.model, cells: [model.model, formatLines(model.tokens), formatMoney(model.cost)] }))}
        />
      )}
    </Panel>
  );
}

export function CommandsPanel({ commands }: { commands: CostCommand[] }) {
  return (
    <Panel title="Команды">
      {commands.length === 0 ? (
        <p className={rowStyles.muted}>Команд пока не было</p>
      ) : (
        <StatsTable
          label="Команды"
          head={["Команда", "Запусков", "Среднее время", "Средняя память", "Пиковая память"]}
          rows={commands.map((command) => ({
            key: command.command,
            cells: [command.command, formatLines(command.runs), formatMs(command.avgMs), formatMb(command.avgRssMb), formatMb(command.maxRssMb)],
          }))}
        />
      )}
    </Panel>
  );
}
