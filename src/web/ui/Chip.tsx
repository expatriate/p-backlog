import { isValidElement, type ReactNode } from "react";
import { cx } from "./cx";
import styles from "./Chip.module.css";

type ToggleChipProps = { pressed: boolean; locked?: boolean; onToggle: () => void; children: ReactNode };

export function ToggleChip({ pressed, locked = false, onToggle, children }: ToggleChipProps) {
  return (
    <button
      type="button"
      className={cx(styles.chip, pressed && styles.pressed)}
      aria-pressed={pressed}
      aria-disabled={locked || undefined}
      onClick={locked ? undefined : onToggle}
    >
      <ChipLabel>{children}</ChipLabel>
    </button>
  );
}

export function Chip({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className={cx(styles.chip, styles.static)} title={title}>
      <ChipLabel>{children}</ChipLabel>
    </span>
  );
}

function ChipLabel({ children }: { children: ReactNode }) {
  return (
    <span className={styles.label} data-bold-width={textOf(children)}>
      <span className={styles.text}>{children}</span>
    </span>
  );
}

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}
