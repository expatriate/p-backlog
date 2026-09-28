import type { Language } from "../../core/i18n/language";
import type { EffectPeriod, EffectProject, EffectTotals, GrainPeriods, ReportPeriod } from "../../core/api/contract";
import { useLanguage, useMessages } from "../i18n";
import { EffectChart } from "./EffectChart";
import { formatLines, formatNoiseShare } from "./effect-format";
import type { StatsMessages } from "./messages.ru";
import rowStyles from "./PanelRows.module.css";
import { Figure, FigureGroup } from "./Figure";
import { Panel } from "./Panel";
import { usePeriodCaption } from "./period-caption";
import { StatsTable } from "./StatsTable";
import { useGrainPanel } from "./use-grain-panel";
import { formatWhole } from "./value-format";
import { NO_VALUE } from "../labels";

export function EffectFigures({ totals, period }: { totals: EffectTotals; period: ReportPeriod }) {
  const { stats } = useMessages();
  const language = useLanguage();
  const caption = usePeriodCaption();
  return (
    <FigureGroup period={caption.labelled(stats.effectWindow, period)}>
      <Figure label={stats.keptOut} value={stats.linesText(totals.deferredLines, totals.estimatedLines)} note={`${keptOutNote(stats, language, totals)} · ${stats.codeAndTests(totals)}`} />
      <Figure label={stats.noiseWithoutBacklog} value={formatNoiseShare(totals.noiseShare)} note={stats.noiseNote} />
      <Figure label={stats.deferredToBacklog} value={formatWhole(language, totals.deferredTasks)} note={stats.deferredNote(totals.fixedTasks, totals.openTasks)} />
      <Figure label={stats.pullRequestLines} value={formatWhole(language, totals.realLines)} />
    </FigureGroup>
  );
}

function keptOutNote(stats: StatsMessages, language: Language, totals: EffectTotals): string {
  const fixed = formatWhole(language, totals.fixedLines);
  if (totals.estimatedLines === null) return stats.keptOutPending(fixed);
  return stats.keptOutEstimated(fixed, formatLines(language, totals.estimatedLines, totals.estimatedLines));
}

export function EffectChartPanel({ weeks, days, windows, totals }: { weeks: EffectPeriod[]; days: EffectPeriod[]; windows: GrainPeriods; totals: EffectTotals }) {
  const { stats } = useMessages();
  const { grain, periods, period, toggle } = useGrainPanel("effect", "week", { week: weeks, day: days }, windows);
  return (
    <Panel title={stats.effectTitle} period={period} aside={toggle}>
      <EffectChart periods={periods} totals={totals} grain={grain} />
    </Panel>
  );
}

export function ProjectsPanel({ projects, period }: { projects: EffectProject[]; period: ReportPeriod }) {
  const { stats } = useMessages();
  const language = useLanguage();
  const caption = usePeriodCaption();
  return (
    <Panel title={stats.byProject} period={caption.labelled(stats.effectWindow, period)}>
      {projects.length === 0 ? (
        <p className={rowStyles.muted}>{stats.noCodeData}</p>
      ) : (
        <StatsTable
          label={stats.byProject}
          head={stats.projectsHead}
          rows={projects.map((project) => ({
            key: project.projectId,
            cells: [
              project.name,
              project.deferredTasks,
              formatWhole(language, project.fixedLines),
              project.estimatedLines === null ? NO_VALUE : formatLines(language, project.estimatedLines, project.estimatedLines),
              formatWhole(language, project.realLines),
              formatNoiseShare(project.noiseShare),
            ],
          }))}
        />
      )}
    </Panel>
  );
}
