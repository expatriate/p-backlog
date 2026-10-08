import type { ReactNode } from "react";
import { cx } from "./cx";
import { POPOVER_INITIAL_FOCUS } from "./Popover";
import styles from "./Menu.module.css";

export function MenuOptions({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className={styles.options} role={label === undefined ? undefined : "group"} aria-label={label}>
      {children}
    </div>
  );
}

export type MenuOptionProps = {
  pressed?: boolean | undefined;
  initialFocus?: boolean | undefined;
  onChoose: () => void;
  children: ReactNode;
};

export function MenuOption({ pressed, initialFocus = pressed, onChoose, children }: MenuOptionProps) {
  return (
    <button type="button" className={cx(styles.option, pressed === true && styles.pressed)} aria-pressed={pressed} {...(initialFocus === true ? POPOVER_INITIAL_FOCUS : {})} onClick={onChoose}>
      {children}
    </button>
  );
}
