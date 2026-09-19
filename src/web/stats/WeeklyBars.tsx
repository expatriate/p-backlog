import { formatDayMonth } from "../labels";
import styles from "./WeeklyChart.module.css";

const WIDTH = 360;
const BAR_HEIGHT = 72;

export function WeeklyBars({ weeks, summary }: { weeks: { start: string; value: number | null }[]; summary: string }) {
  const slot = WIDTH / Math.max(weeks.length, 1);
  const maxValue = Math.max(1, ...weeks.map((week) => week.value ?? 0));
  const first = weeks[0];
  return (
    <figure className={styles.chart}>
      <div role="img" aria-label={summary} className={styles.graphs}>
        <svg viewBox={`0 0 ${WIDTH} ${BAR_HEIGHT}`} preserveAspectRatio="none" className={styles.bars} aria-hidden="true">
          {weeks.map((week, index) =>
            week.value === null ? null : (
              <rect
                key={week.start}
                className={styles.single}
                x={index * slot + slot * 0.25}
                y={BAR_HEIGHT - (week.value / maxValue) * BAR_HEIGHT}
                width={slot * 0.5}
                height={(week.value / maxValue) * BAR_HEIGHT}
              />
            ),
          )}
        </svg>
      </div>
      <figcaption className={styles.caption}>
        <span>{first === undefined ? "" : formatDayMonth(new Date(first.start))} — сейчас</span>
      </figcaption>
    </figure>
  );
}
