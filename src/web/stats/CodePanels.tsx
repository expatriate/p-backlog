import type { ReactNode } from "react";
import type { ChurnRow, CodeDensity, DensityRow } from "../../core/api/contract";
import { useMessages } from "../i18n";
import { Panel } from "./Panel";
import rowStyles from "./PanelRows.module.css";
import styles from "./CodePanels.module.css";

export function ChurnPanel({ churn }: { churn: ChurnRow[] }) {
  const { stats } = useMessages();
  const top = churn[0]?.score ?? 1;
  return (
    <Panel title={stats.churnTitle}>
      <p className={rowStyles.muted}>{stats.churnHint}</p>
      {churn.length === 0 ? (
        <p className={rowStyles.muted}>{stats.churnEmpty}</p>
      ) : (
        <ul className={rowStyles.rows}>
          {churn.map((row) => (
            <li key={row.label} className={styles.churnRow}>
              <code className={rowStyles.rowLabel}>{row.label}</code>
              <span className={rowStyles.rowValue}>{stats.commits(row.commits)}</span>
              <span className={rowStyles.rowValue}>{stats.churnTasks(row.tasks, row.weight)}</span>
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
  const { stats } = useMessages();
  return (
    <Panel title={stats.densityTitle}>
      {density.projects.length === 0 ? (
        <p className={rowStyles.muted}>{stats.noCodeData}</p>
      ) : (
        <>
          <DensityRows rows={density.projects.map((row) => ({ key: row.projectId, label: row.name, row }))} />
          {density.folders.length > 0 && (
            <div>
              <h3 className={rowStyles.subTitle}>{stats.folders}</h3>
              <DensityRows rows={density.folders.map((row) => ({ key: row.label, label: <code>{row.label}</code>, row }))} />
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

function DensityRows({ rows }: { rows: { key: string; label: ReactNode; row: DensityRow }[] }) {
  const { stats, core } = useMessages();
  return (
    <ul className={rowStyles.rows}>
      {rows.map(({ key, label, row }) => (
        <li key={key} className={styles.densityRow}>
          <span className={rowStyles.rowLabel}>{label}</span>
          <span className={rowStyles.rowValue}>{core.count(row.lines, "line")}</span>
          <span className={rowStyles.rowValue}>{core.count(row.open, "task")}</span>
          <span className={rowStyles.rowValue}>{row.perKloc === null ? "—" : stats.perKloc(row.perKloc)}</span>
        </li>
      ))}
    </ul>
  );
}
