import { useId, type ReactNode } from "react";
import styles from "./Panel.module.css";

export function Panel({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  const titleId = useId();
  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <div className={styles.head}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
