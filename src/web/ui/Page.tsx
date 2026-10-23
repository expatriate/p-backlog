import type { HTMLAttributes, ReactNode, RefObject } from "react";
import { cx } from "./cx";
import styles from "./Page.module.css";

export function PageHeading({ ref, children, actions }: { ref: RefObject<HTMLHeadingElement | null>; children: ReactNode; actions?: ReactNode }) {
  const heading = (
    <h1 ref={ref} tabIndex={-1} className={styles.heading}>
      {children}
    </h1>
  );
  if (actions === undefined) return heading;
  return (
    <div className={styles.headingRow}>
      {heading}
      {actions}
    </div>
  );
}

export type PageMessageProps = HTMLAttributes<HTMLElement> & { as?: "div" | "main" };

export function PageMessage({ as: Element = "div", className, ...props }: PageMessageProps) {
  return <Element className={cx(styles.message, className)} {...props} />;
}

export type PageHintState = "hidden" | "shown" | "waiting";

const HINT_CLASS: Record<PageHintState, string> = {
  hidden: "visually-hidden",
  shown: cx(styles.message, styles.hint),
  waiting: cx(styles.message, styles.hint, styles.waiting),
};

export type PageHintProps = { ref: RefObject<HTMLDivElement | null>; state: PageHintState; children: ReactNode };

export function PageHint({ ref, state, children }: PageHintProps) {
  return (
    <div ref={ref} tabIndex={-1} role="status" aria-live="polite" className={HINT_CLASS[state]}>
      {children}
    </div>
  );
}
