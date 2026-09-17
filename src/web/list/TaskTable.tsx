import { Link } from "react-router";
import { isBlocked, taskProgress, type BacklogIndex } from "../../core/model/graph";
import type { Priority, Task } from "../../core/model/types";
import { PRIORITY_LABELS, formatDate } from "../labels";
import { Chip } from "../ui/Chip";
import { ProgressBar } from "../ui/ProgressBar";
import { StatusBadge } from "../ui/StatusBadge";
import { cx } from "../ui/cx";
import styles from "./TaskTable.module.css";

export type TaskTableProps = {
  tasks: Task[];
  index: BacklogIndex;
  selectedId?: string;
  checkedIds: ReadonlySet<string>;
  onCheck: (id: string, checked: boolean) => void;
  taskHref: (task: Task) => string;
};

const VISIBLE_TAGS = 2;

const PRIORITY_CLASS: Record<Priority, string | undefined> = {
  low: styles.low,
  medium: styles.medium,
  high: styles.high,
  critical: styles.critical,
};

export function TaskTable({ tasks, index, selectedId, checkedIds, onCheck, taskHref }: TaskTableProps) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th className={styles.checkCell}>
            <span className={styles.srOnly}>Выбор</span>
          </th>
          <th>ID</th>
          <th>Задача</th>
          <th className={styles.tags}>Теги</th>
          <th>Статус</th>
          <th className={styles.priorityCell}>Приоритет</th>
          <th>Прогресс</th>
          <th className={styles.date}>Создана</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((task) => {
          const blocked = isBlocked(task, index);
          const epic = task.epic === undefined ? undefined : index.byId.get(task.epic);
          return (
            <tr key={task.id} className={cx(styles.row, task.id === selectedId && styles.selected)}>
              <td className={styles.checkCell}>
                <input
                  type="checkbox"
                  checked={checkedIds.has(task.id)}
                  disabled={task.type === "epic"}
                  aria-label={`Выбрать ${task.id}`}
                  onChange={(event) => onCheck(task.id, event.target.checked)}
                />
              </td>
              <td>
                <Link to={taskHref(task)} className={styles.id}>
                  {task.id}
                </Link>
              </td>
              <td>
                <Link to={taskHref(task)} className={styles.title}>
                  {task.title}
                </Link>
                {task.type === "epic" && <span className={styles.marker}>эпик</span>}
                {blocked && task.status !== "blocked" && (
                  <span className={styles.marker} title="Есть открытые блокеры">
                    блокеры
                  </span>
                )}
                {epic && (
                  <span className={styles.marker} title={epic.title}>
                    {epic.id}
                  </span>
                )}
              </td>
              <td className={styles.tags}>
                {task.tags.slice(0, VISIBLE_TAGS).map((tag) => (
                  <Chip key={tag}>#{tag}</Chip>
                ))}
                {task.tags.length > VISIBLE_TAGS && <Chip title={task.tags.join(", ")}>+{task.tags.length - VISIBLE_TAGS}</Chip>}
              </td>
              <td>
                <StatusBadge status={task.status} />
              </td>
              <td className={cx(styles.priorityCell, PRIORITY_CLASS[task.priority])}>{PRIORITY_LABELS[task.priority]}</td>
              <td className={styles.progress}>
                <ProgressBar progress={taskProgress(task, index)} />
              </td>
              <td className={styles.date}>{formatDate(task.created)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
