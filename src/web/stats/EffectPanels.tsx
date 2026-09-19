import { NBSP, plural } from "../../core/stats/format";
import { MIN_FIXES_FOR_ESTIMATE } from "../../core/stats/effect/effect-report";
import type { EffectProject, EffectTotals, EffectWeek } from "../../core/stats/types";
import { EffectWeeksChart } from "./EffectWeeksChart";
import { codeAndTests, formatApprox, formatLines, formatNoiseShare, isEstimated } from "./effect-format";
import flowStyles from "./FlowPanels.module.css";
import { Figure } from "./Figure";
import { Panel } from "./Panel";
import { StatsTable } from "./StatsTable";
import totalsStyles from "./StatsPage.module.css";

export function EffectFigures({ totals }: { totals: EffectTotals }) {
  return (
    <div className={totalsStyles.totals}>
      <Figure label="Посторонних правок вынесено" value={keptOutValue(totals)} note={`${keptOutNote(totals)} · ${codeAndTests(totals)}`} />
      <Figure label="Шум без беклога" value={formatNoiseShare(totals.noiseShare)} note="доля посторонних правок в пулреквестах" />
      <Figure label="Вынесено в беклог" value={String(totals.fixedTasks + totals.openTasks)} note={`исправлено ${totals.fixedTasks}, ожидают ${totals.openTasks}`} />
      <Figure label="Строк в пулреквестах" value={formatLines(totals.realLines)} note="с внедрения беклога" />
    </div>
  );
}

function keptOutValue(totals: EffectTotals): string {
  if (totals.estimatedLines === null) return `${formatLines(totals.fixedLines)}${NBSP}${plural(totals.fixedLines, "строка", "строки", "строк")}`;
  return `${formatApprox(totals.deferredLines, isEstimated(totals.estimatedLines))}${NBSP}${plural(totals.deferredLines, "строка", "строки", "строк")}`;
}

function keptOutNote(totals: EffectTotals): string {
  if (totals.estimatedLines === null) return `исправлено ${formatLines(totals.fixedLines)}; оценка ожидающих появится после ${MIN_FIXES_FOR_ESTIMATE} исправлений`;
  return `исправлено ${formatLines(totals.fixedLines)} + ожидают ${formatApprox(totals.estimatedLines, isEstimated(totals.estimatedLines))}`;
}

export function EffectChartPanel({ weeks, totals }: { weeks: EffectWeek[]; totals: EffectTotals }) {
  return (
    <Panel title="Эффективность">
      <EffectWeeksChart weeks={weeks} totals={totals} />
    </Panel>
  );
}

export function ProjectsPanel({ projects }: { projects: EffectProject[] }) {
  return (
    <Panel title="По проектам">
      {projects.length === 0 ? (
        <p className={flowStyles.muted}>Нет данных о коде: у проектов нет доступных репозиториев</p>
      ) : (
        <StatsTable
          label="По проектам"
          head={["Проект", "Вынесено задач", "Исправлено строк", "Оценка ожидающих", "Строк в пулреквестах", "Шум без беклога"]}
          rows={projects.map((project) => ({
            key: project.projectId,
            cells: [
              project.name,
              project.deferredTasks,
              formatLines(project.fixedLines),
              project.estimatedLines === null ? "—" : formatApprox(project.estimatedLines, isEstimated(project.estimatedLines)),
              formatLines(project.realLines),
              formatNoiseShare(project.noiseShare),
            ],
          }))}
        />
      )}
    </Panel>
  );
}
