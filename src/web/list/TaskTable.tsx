import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { isBlocked, type BacklogIndex } from "../../core/model/graph";
import type { SortDirection, SortKey, TaskSort } from "../../core/model/query";
import type { Priority, Task } from "../../core/model/types";
import { DIRECTION_MARKS, PRIORITY_LABELS, RESOLUTION_LABELS, formatDate } from "../labels";
import { DeletionBar } from "../ui/Countdown";
import { StatusBadge } from "../ui/StatusBadge";
import type { TaskHref } from "../task/TaskRefs";
import { cx } from "../ui/cx";
import { toneOf, type EpicTones } from "../ui/epic-tone";
import { useNow } from "../ui/use-now";
import type { DateColumn } from "./list-params";
import { TagCell } from "./TagCell";
import styles from "./TaskTable.module.css";

export type TaskTableProps = {
  tasks: Task[];
  index: BacklogIndex;
  selectedId?: string | undefined;
  selectedTags: readonly string[];
  onToggleTag: (tag: string) => void;
  sort: TaskSort;
  onSort: (key: SortKey) => void;
  taskHref: TaskHref;
  dateColumn: DateColumn;
  tones: EpicTones;
  isNew: (task: Task) => boolean;
};

const DATE_COLUMN_LABELS: Record<DateColumn, string> = { created: "Создана", closed: "Закрыта" };

const ARIA_SORT: Record<SortDirection, "ascending" | "descending"> = { asc: "ascending", desc: "descending" };

const PRIORITY_CLASS: Record<Priority, string | undefined> = {
  low: styles.low,
  medium: styles.medium,
  high: styles.high,
  critical: styles.critical,
};

export function TaskTable({ tasks, index, selectedId, sort, onSort, taskHref, dateColumn, tones, isNew, selectedTags, onToggleTag }: TaskTableProps) {
  const now = useNow();
  const selectedRow = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    selectedRow.current?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);
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
          {sortableHeader("status", "Статус", styles.statusCell)}
          {sortableHeader("priority", "Приоритет", styles.priorityCell)}
          {sortableHeader(dateColumn, DATE_COLUMN_LABELS[dateColumn], styles.date)}
        </tr>
      </thead>
      <tbody>
        {tasks.map((task) => {
          const blocked = isBlocked(task, index);
          const epic = task.epic === undefined ? undefined : index.byId.get(task.epic);
          const selected = task.id === selectedId;
          return (
            <tr
              key={task.id}
              ref={selected ? selectedRow : undefined}
              className={cx(styles.row, selected && styles.selected)}
              data-epic-tone={toneOf(task, tones)}
            >
              <td>
                <Link to={taskHref(task.id)} className={styles.id}>
                  {task.id}
                </Link>
              </td>
              <td>
                <DeletionBar task={task} now={now} />
                {isNew(task) && <span className={styles.newBadge}>новая</span>}
                <Link to={taskHref(task.id)} className={styles.title} aria-current={selected ? "true" : undefined}>
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
                    {task.reason !== undefined && <span className="visually-hidden">: {task.reason}</span>}
                  </span>
                )}
                {epic && (
                  <span className={cx(styles.marker, styles.epicMarker)} title={epic.title}>
                    {epic.id}
                  </span>
                )}
              </td>
              <td className={styles.tags}>
                <TagCell tags={task.tags} selected={selectedTags} onToggle={onToggleTag} />
              </td>
              <td className={styles.statusCell}>
                <StatusBadge status={task.status} />
              </td>
              <td className={cx(styles.priorityCell, PRIORITY_CLASS[task.priority])}>{PRIORITY_LABELS[task.priority]}</td>
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
