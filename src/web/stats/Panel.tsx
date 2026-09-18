import type { ReactNode } from "react";
import styles from "./Panel.module.css";

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.panel} aria-label={title}>
      <h2 className={styles.title}>{title}</h2>
      {children}
    </section>
  );
}
