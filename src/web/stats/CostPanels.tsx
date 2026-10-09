import { formatMoney } from "../../core/i18n/format";
import type { CostCommand, CostModel, CostTotals, ReportPeriod } from "../../core/api/contract";
import { useLanguage, useMessages } from "../i18n";
import { Figure, FigureGroup } from "./Figure";
import rowStyles from "./PanelRows.module.css";
import { Panel } from "./Panel";
import { usePeriodCaption } from "./period-caption";
import { StatsTable } from "./StatsTable";
import { costValue, formatWhole, wholeFormatter } from "./value-format";

export function CostFigures({ totals, period }: { totals: CostTotals; period: ReportPeriod }) {
  const { stats } = useMessages();
  const language = useLanguage();
  const caption = usePeriodCaption();
  const whole = wholeFormatter(language);
  return (
    <FigureGroup period={caption.of("lastWeek", period)}>
      <Figure label={stats.backlogTokens} value={whole(totals.tokens)} note={stats.backlogTokensNote(whole(totals.hookTokens), whole(totals.cliTokens))} />
      <Figure label={stats.apiPrice} value={costValue(language, totals.cost)} note={totals.hasUnpricedTokens ? stats.unpricedNote : undefined} />
      <Figure label={stats.hookTurns} value={whole(totals.hookTurns)} note={stats.hookRunsNote(whole(totals.hookRuns))} />
      <Figure label={stats.cliCalls} value={whole(totals.cliRuns)} />
    </FigureGroup>
  );
}

export function ModelsPanel({ models, period }: { models: CostModel[]; period: ReportPeriod }) {
  const { stats } = useMessages();
  const language = useLanguage();
  const caption = usePeriodCaption();
  return (
    <Panel title={stats.byModel} period={caption.of("days", period)}>
      {models.length === 0 ? (
        <p className={rowStyles.muted}>{stats.noModels}</p>
      ) : (
        <StatsTable
          label={stats.byModel}
          head={stats.modelsHead}
          rows={models.map((row) => ({
            key: `${row.model}:${row.fast}`,
            cells: [row.fast ? stats.fastModel(row.model) : row.model, formatWhole(language, row.tokens), formatMoney(language, row.cost)],
          }))}
        />
      )}
    </Panel>
  );
}

export function CommandsPanel({ commands, period }: { commands: CostCommand[]; period: ReportPeriod }) {
  const { stats } = useMessages();
  const language = useLanguage();
  const caption = usePeriodCaption();
  return (
    <Panel title={stats.commandsTitle} period={caption.of("days", period)}>
      {commands.length === 0 ? (
        <p className={rowStyles.muted}>{stats.noCommands}</p>
      ) : (
        <StatsTable
          label={stats.commandsTitle}
          head={stats.commandsHead}
          rows={commands.map((command) => ({
            key: command.command,
            cells: [command.command, formatWhole(language, command.runs), stats.milliseconds(formatWhole(language, command.avgMs)), stats.megabytes(command.avgRssMb), stats.megabytes(command.maxRssMb)],
          }))}
        />
      )}
    </Panel>
  );
}
