import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";
import styles from "./Button.module.css";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" };

export function Button({ variant = "secondary", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cx(styles.button, variant === "primary" ? styles.primary : styles.secondary, className)} {...props} />;
}
