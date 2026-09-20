import type { ReactNode } from "react";
import { formatDays, formatDecimal, NBSP, pluralCount } from "../../core/stats/format";
import type { ChurnRow, CodeDensity, DensityRow, FixBreakdown } from "../../core/stats/types";
import { Panel } from "./Panel";
import rowStyles from "./PanelRows.module.css";
import styles from "./CodePanels.module.css";
import { CHURN_PERIOD, STATS_PERIOD } from "./periods";

export function ChurnPanel({ churn }: { churn: ChurnRow[] }) {
  const top = churn[0]?.score ?? 1;
  return (
    <Panel title="Долг в часто меняемом коде">
      <p className={rowStyles.muted}>Место в списке — коммиты за {CHURN_PERIOD} × вес открытых задач папки</p>
      {churn.length === 0 ? (
        <p className={rowStyles.muted}>Долг не лежит в коде, который меняли за {CHURN_PERIOD}</p>
      ) : (
        <ul className={rowStyles.rows}>
          {churn.map((row) => (
            <li key={row.label} className={styles.churnRow}>
              <code className={rowStyles.rowLabel}>{row.label}</code>
              <span className={rowStyles.rowValue}>{pluralCount(row.commits, "коммит", "коммита", "коммитов")}</span>
              <span className={rowStyles.rowValue}>
                {pluralCount(row.tasks, "задача", "задачи", "задач")}, вес {row.weight}
              </span>
              <span className={rowStyles.track} aria-hidden="true">
                <span className={rowStyles.fill} style={{ transform: `scaleX(${row.score / top})` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function DensityPanel({ density }: { density: CodeDensity }) {
  return (
    <Panel title="Плотность долга">
      {density.projects.length === 0 ? (
        <p className={rowStyles.muted}>Нет данных о коде: у проектов нет доступных репозиториев</p>
      ) : (
        <>
          <DensityRows rows={density.projects.map((row) => ({ key: row.projectId, label: row.name, row }))} />
          {density.folders.length > 0 && (
            <>
              <h3 className={styles.subTitle}>Папки</h3>
              <DensityRows rows={density.folders.map((row) => ({ key: row.label, label: <code>{row.label}</code>, row }))} />
            </>
          )}
        </>
      )}
    </Panel>
  );
}

function DensityRows({ rows }: { rows: { key: string; label: ReactNode; row: DensityRow }[] }) {
  return (
    <ul className={rowStyles.rows}>
      {rows.map(({ key, label, row }) => (
        <li key={key} className={styles.densityRow}>
          <span className={rowStyles.rowLabel}>{label}</span>
          <span className={rowStyles.rowValue}>{pluralCount(row.lines, "строка", "строки", "строк")}</span>
          <span className={rowStyles.rowValue}>{pluralCount(row.open, "задача", "задачи", "задач")}</span>
          <span className={rowStyles.rowValue}>{row.perKloc === null ? "—" : `${formatDecimal(row.perKloc)} на 1000${NBSP}строк`}</span>
        </li>
      ))}
    </ul>
  );
}

export function FixesPanel({ fixes }: { fixes: FixBreakdown }) {
  return (
    <Panel title="Кто исправил">
      {fixes.agent + fixes.human + fixes.unknown === 0 ? (
        <p className={rowStyles.muted}>Исправлений за {STATS_PERIOD} нет</p>
      ) : (
        <ul className={rowStyles.rows}>
          <FixRow label="агент" count={fixes.agent} medianDays={fixes.agentMedianDays} />
          <FixRow label="человек" count={fixes.human} medianDays={fixes.humanMedianDays} />
          <li className={rowStyles.row}>
            <span className={rowStyles.rowLabel}>без коммита</span>
            <span className={rowStyles.rowValue}>{fixes.unknown}</span>
          </li>
        </ul>
      )}
    </Panel>
  );
}

function FixRow({ label, count, medianDays }: { label: string; count: number; medianDays: number | null }) {
  return (
    <li className={rowStyles.row}>
      <span className={rowStyles.rowLabel}>{label}</span>
      <span className={rowStyles.rowValue}>
        {count} · медиана {formatDays(medianDays)}
      </span>
    </li>
  );
}
