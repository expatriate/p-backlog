import { formatDayMonth, formatShare } from "../../core/stats/format";
import type { EffectTotals, EffectWeek } from "../../core/stats/types";
import styles from "./EffectPanels.module.css";

const WIDTH = 360;
const HEIGHT = 96;
const PATTERN_ID = "effect-deferred";

export function EffectChart({ weeks, totals }: { weeks: EffectWeek[]; totals: EffectTotals }) {
  const slot = WIDTH / Math.max(weeks.length, 1);
  const peak = Math.max(1, ...weeks.map((week) => week.realLines + week.deferredLines));
  const height = (lines: number) => (lines / peak) * HEIGHT;
  const summary = `${weeks.length} недель: в пулреквестах ${totals.realLines} строк, вынесено ≈ ${totals.deferredLines} строк, шум без беклога ≈ ${formatShare(totals.noiseShare)}`;
  const first = weeks[0];
  return (
    <figure className={styles.chart}>
      <div role="img" aria-label={summary}>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className={styles.bars} aria-hidden="true">
          <defs>
            <pattern id={PATTERN_ID} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" className={styles.hatchBack} />
              <line x1="0" y1="0" x2="0" y2="6" className={styles.hatchLine} />
            </pattern>
          </defs>
          {weeks.map((week, index) => {
            const real = height(week.realLines);
            const deferred = height(week.deferredLines);
            const x = index * slot + slot * 0.2;
            return (
              <g key={week.start}>
                <rect className={styles.real} x={x} y={HEIGHT - real} width={slot * 0.6} height={real} />
                <rect fill={`url(#${PATTERN_ID})`} x={x} y={HEIGHT - real - deferred} width={slot * 0.6} height={deferred} />
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className={styles.caption}>
        <span>{first === undefined ? "" : formatDayMonth(new Date(first.start))} — сейчас</span>
        <span className={styles.legend}>
          <span className={styles.legendReal}>в пулреквестах</span>
          <span className={styles.legendDeferred}>вынесено в беклог</span>
        </span>
      </figcaption>
    </figure>
  );
}
