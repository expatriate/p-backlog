import styles from "./EpicLabel.module.css";

export function EpicDot({ tone }: { tone?: number | undefined }) {
  return <span className={styles.dot} data-epic-tone={tone} aria-hidden="true" />;
}

export function EpicCount({ count }: { count: number }) {
  return <span className={styles.count}>{count}</span>;
}

export function EpicLabel({ id, title, count }: { id: string; title: string; count?: number }) {
  return (
    <>
      <EpicDot />
      <span className={styles.id}>{id}</span>
      <span className={styles.title}>{title}</span>
      {count !== undefined && <EpicCount count={count} />}
    </>
  );
}
