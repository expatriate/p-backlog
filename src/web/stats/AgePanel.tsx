import type { AgeBreakdown, AgeBucket } from "../../core/stats/types";
import { PRIORITIES } from "../../core/model/types";
import { PRIORITY_LABELS } from "../labels";
import { cx } from "../ui/cx";
import rowStyles from "./PanelRows.module.css";
import { Panel } from "./Panel";
import styles from "./StatsPanels.module.css";

const BUCKET_LABELS: Record<AgeBucket, string> = { week: "до 7 дней", month: "7–30 дней", quarter: "30–90 дней", older: "больше 90 дней" };
const PRIORITY_COUNT_LABELS: Record<(typeof PRIORITIES)[number], string> = { critical: "критичных", high: "высоких", medium: "средних", low: "низких" };

function priorityBreakdown(byPriority: Record<(typeof PRIORITIES)[number], number>): string {
  const parts = [...PRIORITIES]
    .reverse()
    .filter((priority) => byPriority[priority] > 0)
    .map((priority) => `${PRIORITY_COUNT_LABELS[priority]} ${byPriority[priority]}`);
  return parts.length === 0 ? "" : ` (${parts.join(", ")})`;
}

export function AgePanel({ age }: { age: AgeBreakdown }) {
  const totals = age.buckets.map(({ bucket, byPriority }) => ({ bucket, total: PRIORITIES.reduce((sum, priority) => sum + byPriority[priority], 0), byPriority }));
  const max = Math.max(1, ...totals.map(({ total }) => total));
  const summary = totals.map(({ bucket, total, byPriority }) => `${BUCKET_LABELS[bucket]}: ${total}${priorityBreakdown(byPriority)}`).join("; ");

  return (
    <Panel title="Возраст открытых">
      <div role="img" aria-label={summary} className={styles.ageRows}>
        {totals.map(({ bucket, total, byPriority }) => (
          <div key={bucket} className={styles.ageRow} aria-hidden="true">
            <span className={styles.ageLabel}>{BUCKET_LABELS[bucket]}</span>
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
            {PRIORITY_LABELS[priority]}
          </span>
        ))}
      </p>
      <p className={cx(styles.alarm, age.urgentStale > 0 && styles.alarmOn)}>Критичные и высокие старше 7 дней: {age.urgentStale}</p>
    </Panel>
  );
}
