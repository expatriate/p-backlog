import type { ReactNode } from "react";
import { formatDays, formatDecimal, NBSP, pluralCount } from "../../core/stats/format";
import type { ChurnRow, CodeDensity, DensityRow, FixBreakdown } from "../../core/stats/types";
import { Panel } from "./Panel";
import flowStyles from "./FlowPanels.module.css";
import styles from "./CodePanels.module.css";

export function ChurnPanel({ churn }: { churn: ChurnRow[] }) {
  const top = churn[0]?.score ?? 1;
  return (
    <Panel title="Долг в часто меняемом коде">
      <p className={flowStyles.muted}>Место в списке — коммиты за 90 дней × вес открытых задач папки</p>
      {churn.length === 0 ? (
        <p className={flowStyles.muted}>Долг не лежит в коде, который меняли за 90 дней</p>
      ) : (
        <ul className={flowStyles.rows}>
          {churn.map((row) => (
            <li key={row.label} className={styles.churnRow}>
              <code className={flowStyles.rowLabel}>{row.label}</code>
              <span className={flowStyles.rowValue}>{pluralCount(row.commits, "коммит", "коммита", "коммитов")}</span>
              <span className={flowStyles.rowValue}>
                {pluralCount(row.tasks, "задача", "задачи", "задач")}, вес {row.weight}
              </span>
              <span className={flowStyles.track} aria-hidden="true">
                <span className={flowStyles.fill} style={{ transform: `scaleX(${row.score / top})` }} />
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
        <p className={flowStyles.muted}>Нет данных о коде: у проектов нет доступных репозиториев</p>
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
    <ul className={flowStyles.rows}>
      {rows.map(({ key, label, row }) => (
        <li key={key} className={styles.densityRow}>
          <span className={flowStyles.rowLabel}>{label}</span>
          <span className={flowStyles.rowValue}>{pluralCount(row.lines, "строка", "строки", "строк")}</span>
          <span className={flowStyles.rowValue}>{pluralCount(row.open, "задача", "задачи", "задач")}</span>
          <span className={flowStyles.rowValue}>{row.perKloc === null ? "—" : `${formatDecimal(row.perKloc)} на 1000${NBSP}строк`}</span>
        </li>
      ))}
    </ul>
  );
}

export function FixesPanel({ fixes }: { fixes: FixBreakdown }) {
  return (
    <Panel title="Кто исправил">
      {fixes.agent + fixes.human + fixes.unknown === 0 ? (
        <p className={flowStyles.muted}>Исправлений за 12 недель нет</p>
      ) : (
        <ul className={flowStyles.rows}>
          <FixRow label="агент" count={fixes.agent} medianDays={fixes.agentMedianDays} />
          <FixRow label="человек" count={fixes.human} medianDays={fixes.humanMedianDays} />
          <li className={flowStyles.row}>
            <span className={flowStyles.rowLabel}>без коммита</span>
            <span className={flowStyles.rowValue}>{fixes.unknown}</span>
          </li>
        </ul>
      )}
    </Panel>
  );
}

function FixRow({ label, count, medianDays }: { label: string; count: number; medianDays: number | null }) {
  return (
    <li className={flowStyles.row}>
      <span className={flowStyles.rowLabel}>{label}</span>
      <span className={flowStyles.rowValue}>
        {count} · медиана {formatDays(medianDays)}
      </span>
    </li>
  );
}
