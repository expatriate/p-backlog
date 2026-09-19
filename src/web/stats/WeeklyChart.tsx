import { formatDayMonth, pluralCount } from "../../core/stats/format";
import type { WeekFlow } from "../../core/stats/types";
import styles from "./WeeklyChart.module.css";

const WIDTH = 360;
const LINE_HEIGHT = 48;
const BAR_HEIGHT = 72;

export function WeeklyChart({ weeks }: { weeks: WeekFlow[] }) {
  const created = weeks.reduce((sum, week) => sum + week.created, 0);
  const closed = weeks.reduce((sum, week) => sum + week.closed, 0);
  const openNow = weeks.at(-1)?.openAtEnd ?? 0;
  const slot = WIDTH / Math.max(weeks.length, 1);
  const maxOpen = Math.max(1, ...weeks.map((week) => week.openAtEnd));
  const maxFlow = Math.max(1, ...weeks.flatMap((week) => [week.created, week.closed]));
  const barHeight = (value: number) => (value / maxFlow) * BAR_HEIGHT;
  const points = weeks.map((week, index) => `${index * slot + slot / 2},${LINE_HEIGHT - (week.openAtEnd / maxOpen) * (LINE_HEIGHT - 4) - 2}`).join(" ");
  const summary = `${pluralCount(weeks.length, "неделя", "недели", "недель")}: создано ${created}, закрыто ${closed}, открыто сейчас ${openNow}`;
  const first = weeks[0];

  return (
    <figure className={styles.chart}>
      <div role="img" aria-label={summary} className={styles.graphs}>
        <svg viewBox={`0 0 ${WIDTH} ${LINE_HEIGHT}`} preserveAspectRatio="none" className={styles.line} aria-hidden="true">
          <polyline points={points} className={styles.open} />
        </svg>
        <svg viewBox={`0 0 ${WIDTH} ${BAR_HEIGHT}`} preserveAspectRatio="none" className={styles.bars} aria-hidden="true">
          {weeks.map((week, index) => (
            <g key={week.start}>
              <rect className={styles.created} x={index * slot + slot * 0.15} y={BAR_HEIGHT - barHeight(week.created)} width={slot * 0.3} height={barHeight(week.created)} />
              <rect className={styles.closed} x={index * slot + slot * 0.55} y={BAR_HEIGHT - barHeight(week.closed)} width={slot * 0.3} height={barHeight(week.closed)} />
            </g>
          ))}
        </svg>
      </div>
      <figcaption className={styles.caption}>
        <span>
          {first === undefined ? "" : formatDayMonth(new Date(first.start))} — сейчас
        </span>
        <span className={styles.legend}>
          <span className={styles.legendOpen}>открыто: {openNow}</span>
          <span className={styles.legendCreated}>создано: {created}</span>
          <span className={styles.legendClosed}>закрыто: {closed}</span>
        </span>
      </figcaption>
    </figure>
  );
}
