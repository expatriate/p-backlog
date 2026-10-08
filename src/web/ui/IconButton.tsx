import type { ComponentProps } from "react";
import { cx } from "./cx";
import styles from "./IconButton.module.css";

type IconButtonTone = "neutral" | "danger" | "muted";

export type IconButtonProps = Omit<ComponentProps<"button">, "type" | "aria-label"> & { label: string; tone?: IconButtonTone };

const TONES: Record<IconButtonTone, string | undefined> = { neutral: undefined, danger: styles.danger, muted: styles.muted };

export function IconButton({ label, tone = "neutral", className, ...props }: IconButtonProps) {
  return <button type="button" className={cx(styles.button, TONES[tone], className)} aria-label={label} {...props} />;
}
