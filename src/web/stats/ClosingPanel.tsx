import type { ClosingBreakdown, ClosingReason } from "../../core/stats/types";
import { cx } from "../ui/cx";
import { formatShare } from "./format";
import { Panel } from "./Panel";
import styles from "./StatsPanels.module.css";

const REASONS: readonly ClosingReason[] = ["done", "fixed", "obsolete", "duplicate", "cancelled"];
const REASON_LABELS: Record<ClosingReason, string> = { done: "сделано", fixed: "исправлено", obsolete: "кода нет", duplicate: "дубль", cancelled: "отменено" };

export function ClosingPanel({ closing }: { closing: ClosingBreakdown }) {
  const total = REASONS.reduce((sum, reason) => sum + closing.byReason[reason], 0);
  const summary = REASONS.map((reason) => `${REASON_LABELS[reason]}: ${closing.byReason[reason]}`).join("; ");

  return (
    <Panel title="Как закрываются">
      <div role="img" aria-label={summary} className={styles.shareBar}>
        {REASONS.map((reason) => (
          <span key={reason} className={cx(styles.share, styles[reason])} style={{ width: total === 0 ? 0 : `${(closing.byReason[reason] / total) * 100}%` }} />
        ))}
      </div>
      <ul className={styles.rows}>
        {REASONS.map((reason) => (
          <li key={reason} className={styles.row}>
            <span className={cx(styles.legendItem, styles[reason])}>{REASON_LABELS[reason]}</span>
            <span className={styles.rowCount}>{closing.byReason[reason]}</span>
          </li>
        ))}
      </ul>
      <p className={styles.actors}>
        <span className={styles.muted}>Кто закрыл:</span>
        <span>агент: {closing.byActor.agent}</span>
        <span>вы: {closing.byActor.human}</span>
        <span>неизвестно: {closing.byActor.unknown}</span>
      </p>
      <p className={styles.muted}>Дубли среди закрытых: {formatShare(closing.duplicateShare)}</p>
      <p className={styles.muted}>Без source среди созданных: {formatShare(closing.withoutSourceShare)}</p>
      <p className={styles.muted}>Возвраты: {closing.reopened}</p>
    </Panel>
  );
}
