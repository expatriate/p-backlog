import type { Priority } from "../../core/model/types";
import { useMessages } from "../i18n";
import styles from "./PriorityLabel.module.css";

const TONES: Record<Priority, string | undefined> = {
  low: styles.low,
  medium: styles.medium,
  high: styles.high,
  critical: styles.critical,
};

export function PriorityLabel({ priority }: { priority: Priority }) {
  const { core } = useMessages();
  return <span className={TONES[priority]}>{core.priorityLabel(priority)}</span>;
}
