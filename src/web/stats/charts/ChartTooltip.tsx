import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import type { TooltipContentProps } from "recharts";
import { SwatchMark } from "./ChartFrame";
import { cx } from "../../ui/cx";
import styles from "./ChartFrame.module.css";
import { isPlotted, tooltipValue, type SeriesEntry } from "./series";

type SeriesTooltipProps<Row> = { title: (row: Row) => string; series: SeriesEntry<Row>[]; liveRegion: HTMLElement | null } & Partial<Pick<TooltipContentProps, "active" | "payload">>;

export function SeriesTooltip<Row>({ title, series, liveRegion, active, payload }: SeriesTooltipProps<Row>): ReactNode {
  const row = payload?.[0]?.payload as Row | undefined;
  if (active !== true || row === undefined) return null;
  const heading = title(row);
  const lines = series.map((entry) => ({ entry, label: entry.tooltipLabel ?? entry.label, value: tooltipValue(entry, row) }));
  const spoken = `${heading}: ${lines.map(({ label, value }) => `${label} ${value}`).join(", ")}`;
  return (
    <>
      {liveRegion !== null && createPortal(spoken, liveRegion)}
      <div className={cx(styles.tooltip, "raised-surface")}>
        <p className={styles.tooltipTitle}>{heading}</p>
        <dl className={styles.tooltipRows}>
          {lines.map(({ entry, label, value }) => (
            <div key={label} className={styles.tooltipRow}>
              <dt>
                {isPlotted(entry) && <SwatchMark shape={entry.shape} color={entry.color} />}
                {label}
              </dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  );
}
