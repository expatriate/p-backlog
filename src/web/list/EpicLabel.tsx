import type { EpicTone } from "../ui/epic-tone";
import styles from "./EpicLabel.module.css";

export function EpicDot({ tone }: { tone: EpicTone | undefined }) {
  return <span className={styles.dot} data-epic-tone={tone} aria-hidden="true" />;
}

export function EpicCount({ count }: { count: number }) {
  return <span className={styles.count}>{count}</span>;
}

export function EpicLabel({ id, title, tone, count }: { id: string; title: string; tone: EpicTone | undefined; count?: number }) {
  return (
    <>
      <EpicDot tone={tone} />
      <span className={styles.id}>{id}</span>
      <span className={styles.title}>{title}</span>
      {count !== undefined && <EpicCount count={count} />}
    </>
  );
}
