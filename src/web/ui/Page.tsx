import type { ReactNode, RefObject } from "react";
import { cx } from "./cx";
import styles from "./Page.module.css";

export function PageHeading({ ref, children }: { ref: RefObject<HTMLHeadingElement | null>; children: ReactNode }) {
  return (
    <h1 ref={ref} tabIndex={-1} className={styles.heading}>
      {children}
    </h1>
  );
}

export type PageHintProps = { ref: RefObject<HTMLDivElement | null>; settled: boolean; waiting?: boolean; children: ReactNode };

export function PageHint({ ref, settled, waiting = false, children }: PageHintProps) {
  return (
    <div ref={ref} tabIndex={-1} role="status" aria-live="polite" className={settled ? "visually-hidden" : cx(styles.hint, waiting && styles.waiting)}>
      {children}
    </div>
  );
}
