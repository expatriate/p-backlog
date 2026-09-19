import type { CSSProperties, ReactNode } from "react";
import type { TooltipContentProps, TooltipValueType } from "recharts";
import { cx } from "../../ui/cx";
import type { LegendShape } from "./ChartFrame";
import styles from "./ChartFrame.module.css";

export type TooltipRow = { label: string; value: string; shape?: LegendShape; color?: string };
export type TooltipView = { title: string; rows: TooltipRow[] };

export function rowTooltip<Row>(describe: (row: Row) => TooltipView) {
  return function RowTooltip({ active, payload }: TooltipContentProps<TooltipValueType, number | string>): ReactNode {
    const row: unknown = payload?.[0]?.payload;
    if (!active || row === undefined) return null;
    const { title, rows } = describe(row as Row);
    return (
      <div className={styles.tooltip}>
        <p className={styles.tooltipTitle}>{title}</p>
        <dl className={styles.tooltipRows}>
          {rows.map((item) => (
            <div key={item.label} className={styles.tooltipRow}>
              <dt>
                {item.shape !== undefined && item.color !== undefined && (
                  <span className={cx(styles.swatch, styles[item.shape])} style={{ "--swatch": item.color } as CSSProperties} aria-hidden="true" />
                )}
                {item.label}
              </dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  };
}
