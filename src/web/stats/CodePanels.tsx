import type { ReactNode } from "react";
import type { ChurnRow, CodeDensity, DensityRow, ReportPeriod } from "../../core/api/contract";
import { useMessages } from "../i18n";
import { Panel, PanelNote } from "./Panel";
import { usePeriodCaption } from "./period-caption";
import rowStyles from "./PanelRows.module.css";
import { ShareBar } from "./ShareBar";
import styles from "./CodePanels.module.css";
import { NO_VALUE } from "../labels";

export function ChurnPanel({ churn, period }: { churn: ChurnRow[]; period: ReportPeriod }) {
  const { stats } = useMessages();
  const caption = usePeriodCaption();
  const top = churn[0]?.score ?? 1;
  return (
    <Panel title={stats.churnTitle} period={caption.of("churn", period)}>
      <PanelNote>{stats.churnHint}</PanelNote>
      {churn.length === 0 ? (
        <PanelNote>{stats.churnEmpty}</PanelNote>
      ) : (
        <ul className={rowStyles.rows}>
          {churn.map((row) => (
            <li key={row.label} className={styles.churnRow}>
              <code className={rowStyles.rowLabel}>{row.label}</code>
              <span className={rowStyles.rowValue}>{stats.commits(row.commits)}</span>
              <span className={rowStyles.rowValue}>{stats.churnTasks(row.tasks, row.weight)}</span>
              <ShareBar share={row.score / top} />
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
    <Panel title={stats.densityTitle} period={stats.periodNow}>
      {density.projects.length === 0 ? (
        <PanelNote>{stats.noCodeData}</PanelNote>
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
          <span className={rowStyles.rowValue}>{row.perKloc === null ? NO_VALUE : stats.perKloc(row.perKloc)}</span>
        </li>
      ))}
    </ul>
  );
}
