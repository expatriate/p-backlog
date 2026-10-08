import type { ComponentProps } from "react";
import { cx } from "./cx";
import styles from "./Meter.module.css";

export type MeterProps = Omit<ComponentProps<"span">, "children"> & { fraction: number };

export function Meter({ fraction, className, ...props }: MeterProps) {
  return (
    <span className={cx(styles.track, className)} {...props}>
      <span className={styles.fill} style={{ transform: `scaleX(${fraction})` }} />
    </span>
  );
}
