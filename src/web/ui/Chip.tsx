import type { ReactNode } from "react";
import { cx } from "./cx";
import styles from "./Chip.module.css";

export function ToggleChip({ pressed, onToggle, children }: { pressed: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <button type="button" className={cx(styles.chip, pressed && styles.pressed)} aria-pressed={pressed} onClick={onToggle}>
      {children}
    </button>
  );
}

export function Chip({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className={cx(styles.chip, styles.static)} title={title}>
      {children}
    </span>
  );
}
