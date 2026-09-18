import { Link } from "react-router";
import { isBlocked, taskProgress, type BacklogIndex } from "../../core/model/graph";
import { deletionDate } from "../../core/model/lifecycle";
import type { SortDirection, SortKey, TaskSort } from "../../core/model/query";
import type { Priority, Task } from "../../core/model/types";
import { DIRECTION_MARKS, PRIORITY_LABELS, RESOLUTION_LABELS, formatDate } from "../labels";
import { DeletionLabel } from "../ui/Countdown";
import { Chip } from "../ui/Chip";
import { ProgressBar } from "../ui/ProgressBar";
import { StatusBadge } from "../ui/StatusBadge";
import type { TaskHref } from "../task/TaskRefs";
import { cx } from "../ui/cx";
import { toneOf, type EpicTones } from "../ui/epic-tone";
import { useNow } from "../ui/use-now";
import type { DateColumn } from "./list-params";
import styles from "./TaskTable.module.css";

export type TaskTableProps = {
  tasks: Task[];
  index: BacklogIndex;
  selectedId?: string;
  sort: TaskSort;
  onSort: (key: SortKey) => void;
  taskHref: TaskHref;
  dateColumn: DateColumn;
  tones: EpicTones;
};

const VISIBLE_TAGS = 2;

const DATE_COLUMN_LABELS: Record<DateColumn, string> = { created: "Создана", closed: "Закрыта" };

const ARIA_SORT: Record<SortDirection, "ascending" | "descending"> = { asc: "ascending", desc: "descending" };

const PRIORITY_CLASS: Record<Priority, string | undefined> = {
  low: styles.low,
  medium: styles.medium,
  high: styles.high,
  critical: styles.critical,
};

export function TaskTable({ tasks, index, selectedId, sort, onSort, taskHref, dateColumn, tones }: TaskTableProps) {
  const now = useNow();
  const sortableHeader = (key: SortKey, label: string, className?: string) => {
    const active = sort.key === key;
    return (
      <th className={className} scope="col" aria-sort={active ? ARIA_SORT[sort.direction] : undefined}>
        <button type="button" className={cx(styles.sortButton, active && styles.sorted)} onClick={() => onSort(key)}>
          {label}
          <span className={styles.sortMark} aria-hidden="true">
            {active && DIRECTION_MARKS[sort.direction]}
          </span>
        </button>
      </th>
    );
  };

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          {sortableHeader("id", "ID")}
          {sortableHeader("title", "Задача")}
          <th className={styles.tags} scope="col">
            Теги
          </th>
          {sortableHeader("status", "Статус")}
          {sortableHeader("priority", "Приоритет", styles.priorityCell)}
          {sortableHeader("progress", "Прогресс")}
          {sortableHeader(dateColumn, DATE_COLUMN_LABELS[dateColumn], styles.date)}
        </tr>
      </thead>
      <tbody>
        {tasks.map((task) => {
          const blocked = isBlocked(task, index);
          const epic = task.epic === undefined ? undefined : index.byId.get(task.epic);
          return (
            <tr
              key={task.id}
              className={cx(styles.row, task.id === selectedId && styles.selected)}
              data-epic-tone={toneOf(task, tones)}
            >
              <td>
                <Link to={taskHref(task.id)} className={styles.id}>
                  {task.id}
                </Link>
              </td>
              <td>
                <Link to={taskHref(task.id)} className={styles.title}>
                  {task.title}
                </Link>
                {task.type === "epic" && <span className={cx(styles.marker, styles.epicMarker)}>эпик</span>}
                {blocked && task.status !== "blocked" && (
                  <span className={styles.marker} title="Есть открытые блокеры">
                    блокеры
                  </span>
                )}
                {task.resolution !== undefined && (
                  <span className={styles.marker} title={task.reason}>
                    {RESOLUTION_LABELS[task.resolution]}
                  </span>
                )}
                {epic && (
                  <span className={cx(styles.marker, styles.epicMarker)} title={epic.title}>
                    {epic.id}
                  </span>
                )}
              </td>
              <td className={styles.tags}>
                <div className={styles.tagList}>
                  {task.tags.slice(0, VISIBLE_TAGS).map((tag) => (
                    <Chip key={tag}>#{tag}</Chip>
                  ))}
                  {task.tags.length > VISIBLE_TAGS && <Chip title={task.tags.join(", ")}>+{task.tags.length - VISIBLE_TAGS}</Chip>}
                </div>
              </td>
              <td>
                <StatusBadge status={task.status} />
              </td>
              <td className={cx(styles.priorityCell, PRIORITY_CLASS[task.priority])}>{PRIORITY_LABELS[task.priority]}</td>
              <td className={styles.progress}>
                {deletionDate(task) !== undefined ? (
                  <DeletionLabel task={task} now={now} />
                ) : (
                  <ProgressBar progress={taskProgress(task, index)} />
                )}
              </td>
              <td className={styles.date}>{formatTaskDate(task, dateColumn)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function formatTaskDate(task: Task, column: DateColumn): string {
  const iso = column === "closed" ? task.closed : task.created;
  return iso === undefined ? "—" : formatDate(iso);
}
