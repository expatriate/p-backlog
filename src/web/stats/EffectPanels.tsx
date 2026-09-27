import type { Language } from "../../core/i18n/language";
import type { EffectPeriod, EffectProject, EffectTotals, GrainPeriods, ReportPeriod } from "../../core/api/contract";
import { useLanguage, useMessages } from "../i18n";
import { EffectChart } from "./EffectChart";
import { GrainToggle } from "./GrainToggle";
import { formatApprox, formatLines, formatNoiseShare, isEstimated } from "./effect-format";
import type { StatsMessages } from "./messages.ru";
import rowStyles from "./PanelRows.module.css";
import { Figure, FigureGroup } from "./Figure";
import { Panel } from "./Panel";
import { usePeriodCaption } from "./period-caption";
import { StatsTable } from "./StatsTable";
import { useGrainSeries } from "./use-grain-series";

export function EffectFigures({ totals, period }: { totals: EffectTotals; period: ReportPeriod }) {
  const { stats } = useMessages();
  const language = useLanguage();
  const caption = usePeriodCaption();
  return (
    <FigureGroup period={caption.labelled(stats.effectWindow, period)}>
      <Figure label={stats.keptOut} value={keptOutValue(stats, totals)} note={`${keptOutNote(stats, language, totals)} · ${stats.codeAndTests(totals)}`} />
      <Figure label={stats.noiseWithoutBacklog} value={formatNoiseShare(totals.noiseShare)} note={stats.noiseNote} />
      <Figure label={stats.deferredToBacklog} value={String(totals.fixedTasks + totals.openTasks)} note={stats.deferredNote(totals.fixedTasks, totals.openTasks)} />
      <Figure label={stats.pullRequestLines} value={formatLines(language, totals.realLines)} note="" />
    </FigureGroup>
  );
}

function keptOutValue(stats: StatsMessages, totals: EffectTotals): string {
  if (totals.estimatedLines === null) return stats.linesText(totals.fixedLines, false);
  return stats.linesText(totals.deferredLines, isEstimated(totals.estimatedLines));
}

function keptOutNote(stats: StatsMessages, language: Language, totals: EffectTotals): string {
  const fixed = formatLines(language, totals.fixedLines);
  if (totals.estimatedLines === null) return stats.keptOutPending(fixed);
  return stats.keptOutEstimated(fixed, formatApprox(language, totals.estimatedLines, isEstimated(totals.estimatedLines)));
}

export function EffectChartPanel({ weeks, days, windows, totals }: { weeks: EffectPeriod[]; days: EffectPeriod[]; windows: GrainPeriods; totals: EffectTotals }) {
  const { stats } = useMessages();
  const caption = usePeriodCaption();
  const { grain, periods, setGrain } = useGrainSeries("effect", "week", { week: weeks, day: days });
  return (
    <Panel title={stats.effectTitle} period={caption.ofGrain(grain, windows)} aside={<GrainToggle chart="effect" grain={grain} onChange={setGrain} />}>
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
              formatLines(language, project.fixedLines),
              project.estimatedLines === null ? "—" : formatApprox(language, project.estimatedLines, isEstimated(project.estimatedLines)),
              formatLines(language, project.realLines),
              formatNoiseShare(project.noiseShare),
            ],
          }))}
        />
      )}
    </Panel>
  );
}
