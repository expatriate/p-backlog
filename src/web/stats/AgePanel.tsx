import type { AgeBreakdown, AgeBucket } from "../../core/stats/types";
import { PRIORITIES } from "../../core/model/types";
import { PRIORITY_LABELS } from "../labels";
import { cx } from "../ui/cx";
import { Panel } from "./Panel";
import styles from "./StatsPanels.module.css";

const BUCKET_LABELS: Record<AgeBucket, string> = { week: "до 7 дней", month: "7–30 дней", quarter: "30–90 дней", older: "больше 90 дней" };

export function AgePanel({ age }: { age: AgeBreakdown }) {
  const totals = age.buckets.map(({ bucket, byPriority }) => ({ bucket, total: PRIORITIES.reduce((sum, priority) => sum + byPriority[priority], 0), byPriority }));
  const max = Math.max(1, ...totals.map(({ total }) => total));
  const summary = totals.map(({ bucket, total }) => `${BUCKET_LABELS[bucket]}: ${total}`).join("; ");

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
            <span className={styles.rowCount}>{total}</span>
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
