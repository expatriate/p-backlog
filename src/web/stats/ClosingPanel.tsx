import type { ReactNode } from "react";
import { formatShare } from "../../core/stats/format";
import type { ClosingBreakdown, ClosingReason, ReportPeriod } from "../../core/api/contract";
import { sum } from "../../core/numbers";
import { useMessages, type WebMessages } from "../i18n";
import { cx } from "../ui/cx";
import rowStyles from "./PanelRows.module.css";
import { Panel } from "./Panel";
import { usePeriodCaption } from "./period-caption";
import styles from "./StatsPanels.module.css";

const REASON_LABELS: Record<ClosingReason, (messages: WebMessages) => string> = {
  done: ({ stats }) => stats.closingReasons.done,
  fixed: ({ core }) => core.resolutionLabel("fixed"),
  obsolete: ({ core }) => core.resolutionLabel("obsolete"),
  duplicate: ({ core }) => core.resolutionLabel("duplicate"),
  cancelled: ({ stats }) => stats.closingReasons.cancelled,
  unknown: ({ stats }) => stats.closingReasons.unknown,
};
const REASONS = Object.keys(REASON_LABELS) as ClosingReason[];

export function ClosingPanel({ closing, period }: { closing: ClosingBreakdown; period: ReportPeriod }) {
  const messages = useMessages();
  const caption = usePeriodCaption();
  const { stats } = messages;
  const total = sum(REASONS.map((reason) => closing.byReason[reason]));
  const summary = REASONS.map((reason) => `${REASON_LABELS[reason](messages)}: ${closing.byReason[reason]}`).join("; ");

  return (
    <Panel title={stats.closing} period={caption.of("weeks", period)}>
      <div role="img" aria-label={summary} className={styles.shareBar}>
        {REASONS.map((reason) => (
          <span key={reason} className={cx(styles.share, styles[reason])} style={{ width: total === 0 ? 0 : `${(closing.byReason[reason] / total) * 100}%` }} />
        ))}
      </div>
      <ul className={rowStyles.rows}>
        {REASONS.map((reason) => (
          <li key={reason} className={rowStyles.row}>
            <span className={cx(styles.legendItem, styles[reason])}>{REASON_LABELS[reason](messages)}</span>
            <span className={rowStyles.rowValue}>{closing.byReason[reason]}</span>
          </li>
        ))}
      </ul>
      <div>
        <h3 className={rowStyles.subTitle}>{stats.noiseAndReopens}</h3>
        <ul className={rowStyles.rows}>
          <MetricRow label={stats.duplicatesAmongClosed} value={formatShare(closing.duplicateShare)} />
          <MetricRow label={stats.noSourceAmongCreated} value={formatShare(closing.withoutSourceShare)} />
          <MetricRow label={stats.reopened} value={closing.reopened} />
        </ul>
      </div>
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
