import { formatMoney } from "../../core/i18n/format";
import { COST_TOTALS_DAYS } from "../../core/stats/cost/cost-report";
import type { CostCommand, CostDay, CostModel, CostTotals } from "../../core/stats/types";
import { sum } from "../../core/stats/numbers";
import { useLanguage, useMessages } from "../i18n";
import { costValue } from "./cost-format";
import { formatLines } from "./effect-format";
import { Figure } from "./Figure";
import rowStyles from "./PanelRows.module.css";
import { Panel } from "./Panel";
import { StatsTable } from "./StatsTable";
import totalsStyles from "./StatsPage.module.css";

export function CostFigures({ totals, days }: { totals: CostTotals; days: CostDay[] }) {
  const { stats } = useMessages();
  const language = useLanguage();
  const lastWeek = days.slice(-COST_TOTALS_DAYS);
  const hookTokens = sum(lastWeek.map((day) => day.hookTokens));
  const cliTokens = sum(lastWeek.map((day) => day.cliTokens));
  const lines = (value: number) => formatLines(language, value);
  return (
    <div className={totalsStyles.totals}>
      <Figure label={stats.backlogTokens} value={lines(totals.tokens)} note={stats.backlogTokensNote(lines(hookTokens), lines(cliTokens))} />
      <Figure label={stats.apiPrice} value={costValue(language, totals.cost)} note={totals.hasUnpricedTokens ? stats.unpricedNote : ""} />
      <Figure label={stats.hookTurns} value={lines(totals.hookTurns)} note={stats.hookRunsNote(lines(totals.hookRuns))} />
      <Figure label={stats.cliCalls} value={lines(totals.cliRuns)} note="" />
    </div>
  );
}

export function ModelsPanel({ models }: { models: CostModel[] }) {
  const { stats } = useMessages();
  const language = useLanguage();
  return (
    <Panel title={stats.byModel}>
      {models.length === 0 ? (
        <p className={rowStyles.muted}>{stats.noModels}</p>
      ) : (
        <StatsTable
          label={stats.byModel}
          head={stats.modelsHead}
          rows={models.map((row) => ({
            key: `${row.model}:${row.fast}`,
            cells: [row.fast ? stats.fastModel(row.model) : row.model, formatLines(language, row.tokens), formatMoney(language, row.cost)],
          }))}
        />
      )}
    </Panel>
  );
}

export function CommandsPanel({ commands }: { commands: CostCommand[] }) {
  const { stats } = useMessages();
  const language = useLanguage();
  return (
    <Panel title={stats.commandsTitle}>
      {commands.length === 0 ? (
        <p className={rowStyles.muted}>{stats.noCommands}</p>
      ) : (
        <StatsTable
          label={stats.commandsTitle}
          head={stats.commandsHead}
          rows={commands.map((command) => ({
            key: command.command,
            cells: [command.command, formatLines(language, command.runs), stats.milliseconds(command.avgMs), stats.megabytes(command.avgRssMb), stats.megabytes(command.maxRssMb)],
          }))}
        />
      )}
    </Panel>
  );
}
