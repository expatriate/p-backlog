import type { ComponentProps } from "react";
import { cx } from "./cx";
import styles from "./Button.module.css";

export type ButtonProps = Omit<ComponentProps<"button">, "disabled" | "aria-disabled"> & { variant?: "primary" | "secondary"; busy?: boolean; unavailable?: boolean };

export function Button({ variant = "secondary", busy = false, unavailable = false, className, type = "button", onClick, ...props }: ButtonProps) {
  const pressable = !busy && !unavailable;
  return (
    <button
      type={type}
      className={cx(styles.button, variant === "primary" ? styles.primary : styles.secondary, className)}
      aria-disabled={!pressable || undefined}
      aria-busy={busy || undefined}
      onClick={pressable ? onClick : (event) => event.preventDefault()}
      {...props}
    />
  );
}
