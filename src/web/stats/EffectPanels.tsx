import { NBSP, plural } from "../../core/stats/format";
import { MIN_FIXES_FOR_ESTIMATE } from "../../core/stats/effect/effect-report";
import type { EffectProject, EffectTotals, EffectWeek } from "../../core/stats/types";
import { EffectChart } from "./EffectChart";
import { formatApprox, formatLines, formatNoiseShare, isEstimated } from "./effect-format";
import flowStyles from "./FlowPanels.module.css";
import { Figure } from "./Figure";
import { Panel } from "./Panel";
import styles from "./QualityPanels.module.css";
import totalsStyles from "./StatsPage.module.css";

export function EffectFigures({ totals }: { totals: EffectTotals }) {
  return (
    <div className={totalsStyles.totals}>
      <Figure label="Посторонних правок вынесено" value={keptOutValue(totals)} note={keptOutNote(totals)} />
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
    <Panel title="Без беклога и с ним">
      <EffectChart weeks={weeks} totals={totals} />
    </Panel>
  );
}

export function ProjectsPanel({ projects }: { projects: EffectProject[] }) {
  return (
    <Panel title="По проектам">
      {projects.length === 0 ? (
        <p className={flowStyles.muted}>Нет данных о коде: у проектов нет доступных репозиториев</p>
      ) : (
        <div className={styles.scroll} tabIndex={0} role="region" aria-label="Таблица «По проектам»">
          <table className={styles.table} aria-label="По проектам">
            <thead>
              <tr>
                <th scope="col">Проект</th>
                <th scope="col">Вынесено задач</th>
                <th scope="col">Исправлено строк</th>
                <th scope="col">Оценка ожидающих</th>
                <th scope="col">Строк в пулреквестах</th>
                <th scope="col">Шум без беклога</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.projectId}>
                  <th scope="row">{project.name}</th>
                  <td>{project.deferredTasks}</td>
                  <td>{formatLines(project.fixedLines)}</td>
                  <td>{project.estimatedLines === null ? "—" : formatApprox(project.estimatedLines, isEstimated(project.estimatedLines))}</td>
                  <td>{formatLines(project.realLines)}</td>
                  <td>{formatNoiseShare(project.noiseShare)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
