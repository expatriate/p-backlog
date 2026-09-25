import type { Language } from "../../core/i18n/language";
import type { EffectPeriod, EffectProject, EffectTotals } from "../../core/api/contract";
import { useLanguage, useMessages } from "../i18n";
import { EffectChart } from "./EffectChart";
import { GrainToggle } from "./GrainToggle";
import { formatApprox, formatLines, formatNoiseShare, isEstimated } from "./effect-format";
import type { StatsMessages } from "./messages.ru";
import rowStyles from "./PanelRows.module.css";
import { Figure } from "./Figure";
import { Panel } from "./Panel";
import { StatsTable } from "./StatsTable";
import totalsStyles from "./StatsPage.module.css";
import { useChartGrain } from "./use-chart-grain";

export function EffectFigures({ totals }: { totals: EffectTotals }) {
  const { stats } = useMessages();
  const language = useLanguage();
  return (
    <div className={totalsStyles.totals}>
      <Figure label={stats.keptOut} value={keptOutValue(stats, totals)} note={`${keptOutNote(stats, language, totals)} · ${stats.codeAndTests(totals)}`} />
      <Figure label={stats.noiseWithoutBacklog} value={formatNoiseShare(totals.noiseShare)} note={stats.noiseNote} />
      <Figure label={stats.deferredToBacklog} value={String(totals.fixedTasks + totals.openTasks)} note={stats.deferredNote(totals.fixedTasks, totals.openTasks)} />
      <Figure label={stats.pullRequestLines} value={formatLines(language, totals.realLines)} note={stats.sinceAdoption} />
    </div>
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

export function EffectChartPanel({ weeks, days, totals }: { weeks: EffectPeriod[]; days: EffectPeriod[]; totals: EffectTotals }) {
  const { stats } = useMessages();
  const [grain, setGrain] = useChartGrain("effect", "week");
  return (
    <Panel title={stats.effectTitle} aside={<GrainToggle chart={stats.effectTitle} grain={grain} onChange={setGrain} />}>
      <EffectChart periods={grain === "week" ? weeks : days} totals={totals} grain={grain} />
    </Panel>
  );
}

export function ProjectsPanel({ projects }: { projects: EffectProject[] }) {
  const { stats } = useMessages();
  const language = useLanguage();
  return (
    <Panel title={stats.byProject}>
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
