import { useId } from "react";
import { formatDayMonth } from "../../core/stats/format";
import type { EffectTotals, EffectWeek } from "../../core/stats/types";
import { formatApprox, formatLines, formatNoiseShare, isEstimated } from "./effect-format";
import styles from "./EffectPanels.module.css";

const WIDTH = 360;
const HEIGHT = 96;

export function EffectChart({ weeks, totals }: { weeks: EffectWeek[]; totals: EffectTotals }) {
  const patternId = useId();
  const slot = WIDTH / Math.max(weeks.length, 1);
  const peak = Math.max(1, ...weeks.map((week) => week.onTopicLines + week.deferredLines));
  const height = (lines: number) => (lines / peak) * HEIGHT;
  const deferredText = formatApprox(totals.deferredLines, isEstimated(totals.estimatedLines));
  const summary = `${weeks.length} недель: в пулреквестах ${formatLines(totals.realLines)} строк, вынесено ${deferredText} строк, шум без беклога ${formatNoiseShare(totals.noiseShare)}`;
  const first = weeks[0];
  return (
    <figure className={styles.chart}>
      <div role="img" aria-label={summary}>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className={styles.bars} aria-hidden="true">
          <defs>
            <pattern id={patternId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" className={styles.hatchBack} />
              <line x1="0" y1="0" x2="0" y2="6" className={styles.hatchLine} />
            </pattern>
          </defs>
          {weeks.map((week, index) => {
            const onTopic = height(week.onTopicLines);
            const deferred = height(week.deferredLines);
            const x = index * slot + slot * 0.2;
            return (
              <g key={week.start}>
                <rect className={styles.real} x={x} y={HEIGHT - onTopic} width={slot * 0.6} height={onTopic} />
                <rect fill={`url(#${patternId})`} x={x} y={HEIGHT - onTopic - deferred} width={slot * 0.6} height={deferred} />
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
