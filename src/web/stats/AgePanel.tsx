import type { AgeBreakdown } from "../../core/api/contract";
import { PRIORITIES, type Priority } from "../../core/model/types";
import { sum } from "../../core/stats/numbers";
import { useMessages } from "../i18n";
import { cx } from "../ui/cx";
import type { StatsMessages } from "./messages.ru";
import rowStyles from "./PanelRows.module.css";
import { Panel } from "./Panel";
import styles from "./StatsPanels.module.css";

function priorityBreakdown(stats: StatsMessages, byPriority: Record<Priority, number>): string {
  const parts = [...PRIORITIES]
    .reverse()
    .filter((priority) => byPriority[priority] > 0)
    .map((priority) => `${stats.priorityCounts[priority]} ${byPriority[priority]}`);
  return parts.length === 0 ? "" : ` (${parts.join(", ")})`;
}

export function AgePanel({ age }: { age: AgeBreakdown }) {
  const { stats, core } = useMessages();
  const totals = age.buckets.map(({ bucket, byPriority }) => ({ bucket, total: sum(PRIORITIES.map((priority) => byPriority[priority])), byPriority }));
  const max = Math.max(1, ...totals.map(({ total }) => total));
  const summary = totals.map(({ bucket, total, byPriority }) => `${stats.ageBuckets[bucket]}: ${total}${priorityBreakdown(stats, byPriority)}`).join("; ");

  return (
    <Panel title={stats.openAge}>
      <div role="img" aria-label={summary} className={styles.ageRows}>
        {totals.map(({ bucket, total, byPriority }) => (
          <div key={bucket} className={styles.ageRow} aria-hidden="true">
            <span className={styles.ageLabel}>{stats.ageBuckets[bucket]}</span>
            <span className={styles.ageTrack}>
              {PRIORITIES.map((priority) => (
                <span key={priority} className={cx(styles.ageSegment, styles[priority])} style={{ width: `${(byPriority[priority] / max) * 100}%` }} />
              ))}
            </span>
            <span className={rowStyles.rowValue}>{total}</span>
          </div>
        ))}
      </div>
      <p className={styles.legend}>
        {[...PRIORITIES].reverse().map((priority) => (
          <span key={priority} className={cx(styles.legendItem, styles[priority])}>
            {core.priorityLabel(priority)}
          </span>
        ))}
      </p>
      <p className={cx(styles.alarm, age.urgentStale > 0 && styles.alarmOn)}>{stats.urgentStale(age.urgentStale)}</p>
    </Panel>
  );
}
