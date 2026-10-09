import { useId, type ReactNode } from "react";
import styles from "./Panel.module.css";

export function Panel({ title, period, aside, children }: { title: string; period?: string | undefined; aside?: ReactNode; children: ReactNode }) {
  const titleId = useId();
  const periodId = useId();
  return (
    <section className={styles.panel} aria-labelledby={titleId} aria-describedby={period === undefined ? undefined : periodId}>
      <div className={styles.head}>
        <div className={styles.heading}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {period !== undefined && (
            <p id={periodId} className={styles.period}>
              {period}
            </p>
          )}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function PanelNote({ children }: { children: ReactNode }) {
  return <p className={styles.note}>{children}</p>;
}
