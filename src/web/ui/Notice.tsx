import type { HTMLAttributes } from "react";
import { cx } from "./cx";
import styles from "./Notice.module.css";

export type NoticeProps = HTMLAttributes<HTMLElement> & { as?: "p" | "div" | "ul"; shown?: boolean };

export function Notice({ as: Element = "p", shown = true, className, ...props }: NoticeProps) {
  return <Element className={shown ? cx(styles.notice, className) : "visually-hidden"} {...props} />;
}
