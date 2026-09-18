import { SORT_KEYS, type SortKey, type TaskSort } from "../../core/model/query";
import { PRIORITIES, TASK_STATUSES, TASK_TYPES, type Task, type TaskStatus } from "../../core/model/types";
import { DIRECTION_LABELS, DIRECTION_MARKS, PRIORITY_LABELS, SORT_LABELS, STATUS_LABELS, TYPE_LABELS } from "../labels";
import { Button } from "../ui/Button";
import { ToggleChip } from "../ui/Chip";
import { pickSortKey, reverseSort, type ListParams } from "./list-params";
import styles from "./Toolbar.module.css";

export type ToolbarProps = {
  params: ListParams;
  onChange: (params: ListParams) => void;
  tags: string[];
  epics: Task[];
};

export function Toolbar({ params, onChange, tags, epics }: ToolbarProps) {
  const { filter, sort } = params;
  const pressedStatuses = filter.statuses ?? TASK_STATUSES;
  const setFilter = (patch: Partial<ListParams["filter"]>) => onChange({ ...params, filter: { ...filter, ...patch } });
  const setSort = (next: TaskSort) => onChange({ ...params, sort: next });

  return (
    <div className={styles.toolbar}>
      <div className={styles.line}>
        <input
          type="search"
          className={styles.search}
          value={filter.query ?? ""}
          placeholder="Поиск по названию, описанию и ID"
          aria-label="Поиск задач"
          onChange={(event) => setFilter({ query: event.target.value || undefined })}
        />
        <label className={styles.sort}>
          Сортировать по
          <select value={sort.key} onChange={(event) => setSort(pickSortKey(sort, event.target.value as SortKey))}>
            {SORT_KEYS.map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
        </label>
        <Button className={styles.direction} aria-label={DIRECTION_LABELS[sort.direction]} onClick={() => setSort(reverseSort(sort))}>
          {DIRECTION_MARKS[sort.direction]}
        </Button>
      </div>

      <div className={styles.line}>
        <div className={styles.group} role="group" aria-label="Статус">
          {TASK_STATUSES.map((status) => (
            <ToggleChip
              key={status}
              pressed={pressedStatuses.includes(status)}
              onToggle={() => setFilter({ statuses: allOrSome(toggle(pressedStatuses, status)) })}
            >
              {STATUS_LABELS[status]}
            </ToggleChip>
          ))}
        </div>
        <div className={styles.group} role="group" aria-label="Приоритет">
          {PRIORITIES.map((priority) => (
            <ToggleChip
              key={priority}
              pressed={filter.priorities?.includes(priority) ?? false}
              onToggle={() => setFilter({ priorities: emptyToUndefined(toggle(filter.priorities ?? [], priority)) })}
            >
              {PRIORITY_LABELS[priority]}
            </ToggleChip>
          ))}
        </div>
        <div className={styles.group} role="group" aria-label="Тип">
          {TASK_TYPES.map((type) => (
            <ToggleChip key={type} pressed={filter.type === type} onToggle={() => setFilter({ type: filter.type === type ? undefined : type })}>
              {TYPE_LABELS[type]}
            </ToggleChip>
          ))}
          <ToggleChip pressed={filter.onlyUnblocked === true} onToggle={() => setFilter({ onlyUnblocked: filter.onlyUnblocked ? undefined : true })}>
            без блокеров
          </ToggleChip>
        </div>
        {epics.length > 0 && (
          <label className={styles.sort}>
            Эпик
            <select
              value={filter.epic === undefined ? "" : (filter.epic ?? "none")}
              aria-label="Эпик"
              onChange={(event) => setFilter({ epic: readEpicValue(event.target.value) })}
            >
              <option value="">любой</option>
              <option value="none">без эпика</option>
              {epics.map((epic) => (
                <option key={epic.id} value={epic.id}>
                  {epic.id} — {epic.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {tags.length > 0 && (
        <div className={styles.group} role="group" aria-label="Теги">
          {tags.map((tag) => (
            <ToggleChip key={tag} pressed={filter.tags?.includes(tag) ?? false} onToggle={() => setFilter({ tags: emptyToUndefined(toggle(filter.tags ?? [], tag)) })}>
              #{tag}
            </ToggleChip>
          ))}
        </div>
      )}
    </div>
  );
}

function toggle<T extends string>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((candidate) => candidate !== value) : [...values, value];
}

function allOrSome(statuses: TaskStatus[]): TaskStatus[] | undefined {
  return statuses.length === TASK_STATUSES.length ? undefined : statuses;
}

function emptyToUndefined<T>(values: T[]): T[] | undefined {
  return values.length > 0 ? values : undefined;
}

function readEpicValue(value: string): string | null | undefined {
  if (value === "") return undefined;
  return value === "none" ? null : value;
}
