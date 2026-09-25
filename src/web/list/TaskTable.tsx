import { useEffect, useRef, type ChangeEvent, type KeyboardEvent } from "react";
import { Link } from "react-router";
import { isBlocked, type BacklogIndex } from "../../core/model/graph";
import { formatDate } from "../../core/i18n/format";
import type { Language } from "../../core/i18n/language";
import type { SortDirection, SortKey, TaskSort } from "../../core/model/query";
import type { Priority, Task } from "../../core/model/types";
import { DIRECTION_MARKS } from "../labels";
import { useLanguage, useMessages } from "../i18n";
import { DeletionBar } from "../ui/Countdown";
import { StatusBadge } from "../ui/StatusBadge";
import type { TaskHref } from "../task/TaskRefs";
import { cx } from "../ui/cx";
import { toneOf, type EpicTones } from "../ui/epic-tone";
import { useNow } from "../ui/use-now";
import type { DateColumn } from "./list-params";
import { TagCell } from "./TagCell";
import type { TaskSelection } from "./use-task-selection";
import styles from "./TaskTable.module.css";

export type TaskTableProps = {
  tasks: Task[];
  index: BacklogIndex;
  openedId?: string | undefined;
  selectedTags: readonly string[];
  onToggleTag: (tag: string) => void;
  sort: TaskSort;
  onSort: (key: SortKey) => void;
  taskHref: TaskHref;
  dateColumn: DateColumn;
  tones: EpicTones;
  isNew: (task: Task) => boolean;
  selection: Pick<TaskSelection, "selected" | "allVisibleState" | "toggle" | "setAllVisible">;
  describedBy?: string | undefined;
};

const ARIA_SORT: Record<SortDirection, "ascending" | "descending"> = { asc: "ascending", desc: "descending" };

const PRIORITY_CLASS: Record<Priority, string | undefined> = {
  low: styles.low,
  medium: styles.medium,
  high: styles.high,
  critical: styles.critical,
};

export function TaskTable({ tasks, index, openedId, sort, onSort, taskHref, dateColumn, tones, isNew, selectedTags, onToggleTag, selection, describedBy }: TaskTableProps) {
  const { list, core } = useMessages();
  const language = useLanguage();
  const now = useNow();
  const openedRow = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    openedRow.current?.scrollIntoView({ block: "nearest" });
  }, [openedId]);
  const dateColumnLabels: Record<DateColumn, string> = { created: list.created, closed: list.closed };
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
    <table className={styles.table} aria-describedby={describedBy}>
      <thead>
        <tr>
          <th className={styles.pick} scope="col">
            <SelectAllCheckbox state={selection.allVisibleState} label={list.selectAllVisible} onChange={selection.setAllVisible} />
          </th>
          {sortableHeader("id", "ID")}
          {sortableHeader("title", list.task)}
          <th className={styles.tags} scope="col">
            {list.tags}
          </th>
          {sortableHeader("status", list.status, styles.statusCell)}
          {sortableHeader("priority", list.priority, styles.priorityCell)}
          {sortableHeader(dateColumn, dateColumnLabels[dateColumn], styles.date)}
        </tr>
      </thead>
      <tbody>
        {tasks.map((task) => {
          const blocked = isBlocked(task, index);
          const epic = task.epic === undefined ? undefined : index.byId.get(task.epic);
          const opened = task.id === openedId;
          return (
            <tr
              key={task.id}
              ref={opened ? openedRow : undefined}
              className={cx(styles.row, opened && styles.opened)}
              data-epic-tone={toneOf(task, tones)}
              onKeyDown={(event) => {
                if (!isSpaceOnLink(event)) return;
                event.preventDefault();
                selection.toggle(task.id, { range: event.shiftKey });
              }}
            >
              <td className={styles.pick}>
                <label className={styles.pickTarget}>
                  <input
                    type="checkbox"
                    checked={selection.selected.has(task.id)}
                    aria-label={list.selectTask(task.id)}
                    onChange={(event) => selection.toggle(task.id, { range: isShiftClick(event) })}
                  />
                </label>
              </td>
              <td>
                <Link to={taskHref(task.id)} className={styles.id}>
                  {task.id}
                </Link>
              </td>
              <td>
                <DeletionBar task={task} now={now} />
                {isNew(task) && <span className={styles.newBadge}>{list.newBadge}</span>}
                <Link to={taskHref(task.id)} className={styles.title} aria-current={opened ? "true" : undefined}>
                  {task.title}
                </Link>
                {task.type === "epic" && <span className={cx(styles.marker, styles.epicMarker)}>{list.epicBadge}</span>}
                {blocked && task.status !== "blocked" && (
                  <span className={styles.marker} title={list.blockedTitle}>
                    {list.blockedBadge}
                  </span>
                )}
                {task.resolution !== undefined && (
                  <span className={styles.marker} title={task.reason}>
                    {core.resolutionLabel(task.resolution)}
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
              <td className={cx(styles.priorityCell, PRIORITY_CLASS[task.priority])}>{core.priorityLabel(task.priority)}</td>
              <td className={styles.date}>{formatTaskDate(task, dateColumn, language)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SelectAllCheckbox({ state, label, onChange }: { state: TaskSelection["allVisibleState"]; label: string; onChange: (on: boolean) => void }) {
  const checkbox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (checkbox.current) checkbox.current.indeterminate = state === "some";
  }, [state]);
  return (
    <label className={styles.pickTarget}>
      <input ref={checkbox} type="checkbox" checked={state === "all"} aria-label={label} onChange={() => onChange(state !== "all")} />
    </label>
  );
}

function isSpaceOnLink(event: KeyboardEvent): boolean {
  return event.key === " " && event.target instanceof HTMLAnchorElement;
}

function isShiftClick(event: ChangeEvent): boolean {
  return event.nativeEvent instanceof MouseEvent && event.nativeEvent.shiftKey;
}

function formatTaskDate(task: Task, column: DateColumn, language: Language): string {
  const iso = column === "closed" ? task.closed : task.created;
  return iso === undefined ? "—" : formatDate(language, iso);
}
