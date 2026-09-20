import type { ReactNode } from "react";
import { formatShare } from "../../core/stats/format";
import type { ClosingBreakdown, ClosingReason } from "../../core/stats/types";
import { cx } from "../ui/cx";
import rowStyles from "./PanelRows.module.css";
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
      <ul className={rowStyles.rows}>
        {REASONS.map((reason) => (
          <li key={reason} className={rowStyles.row}>
            <span className={cx(styles.legendItem, styles[reason])}>{REASON_LABELS[reason]}</span>
            <span className={rowStyles.rowValue}>{closing.byReason[reason]}</span>
          </li>
        ))}
      </ul>
      <p className={rowStyles.muted}>Кто закрыл:</p>
      <ul className={rowStyles.rows}>
        <MetricRow label="агент" value={closing.byActor.agent} />
        <MetricRow label="человек" value={closing.byActor.human} />
        <MetricRow label="неизвестно" value={closing.byActor.unknown} />
      </ul>
      <p className={rowStyles.muted}>Шум и возвраты:</p>
      <ul className={rowStyles.rows}>
        <MetricRow label="Дубли среди закрытых" value={formatShare(closing.duplicateShare)} />
        <MetricRow label="Без source среди созданных" value={formatShare(closing.withoutSourceShare)} />
        <MetricRow label="Возвраты" value={closing.reopened} />
      </ul>
    </Panel>
  );
}

function MetricRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <li className={rowStyles.row}>
      <span className={rowStyles.rowLabel}>{label}</span>
      <span className={rowStyles.rowValue}>{value}</span>
    </li>
  );
}
