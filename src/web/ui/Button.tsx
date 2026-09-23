import type { ComponentProps } from "react";
import { cx } from "./cx";
import styles from "./Button.module.css";

export type ButtonProps = ComponentProps<"button"> & { variant?: "primary" | "secondary"; busy?: boolean };

export function Button({ variant = "secondary", busy = false, className, type = "button", onClick, ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(styles.button, variant === "primary" ? styles.primary : styles.secondary, className)}
      aria-disabled={busy || undefined}
      aria-busy={busy || undefined}
      onClick={busy ? undefined : onClick}
      {...props}
    />
  );
}
