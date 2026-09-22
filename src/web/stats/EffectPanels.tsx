import { useState } from "react";
import { NBSP, plural } from "../../core/stats/format";
import { MIN_FIXES_FOR_ESTIMATE } from "../../core/stats/effect/effect-report";
import type { EffectPeriod, EffectProject, EffectTotals } from "../../core/stats/types";
import { EffectWeeksChart, type Grain } from "./EffectWeeksChart";
import { ToggleChip } from "../ui/Chip";
import { codeAndTests, formatApprox, formatLines, formatNoiseShare, isEstimated } from "./effect-format";
import rowStyles from "./PanelRows.module.css";
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

export function EffectChartPanel({ weeks, days, totals }: { weeks: EffectPeriod[]; days: EffectPeriod[]; totals: EffectTotals }) {
  const [grain, setGrain] = useState<Grain>("week");
  const toggle = (
    <span role="group" aria-label="Масштаб графика" className={rowStyles.grain}>
      <ToggleChip pressed={grain === "week"} onToggle={() => setGrain("week")}>
        неделя
      </ToggleChip>
      <ToggleChip pressed={grain === "day"} onToggle={() => setGrain("day")}>
        день
      </ToggleChip>
    </span>
  );

  return (
    <Panel title="Эффективность" aside={toggle}>
      <EffectWeeksChart periods={grain === "week" ? weeks : days} totals={totals} grain={grain} />
    </Panel>
  );
}

export function ProjectsPanel({ projects }: { projects: EffectProject[] }) {
  return (
    <Panel title="По проектам">
      {projects.length === 0 ? (
        <p className={rowStyles.muted}>Нет данных о коде: у проектов нет доступных репозиториев</p>
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
