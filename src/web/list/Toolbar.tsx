import { useState } from "react";
import { normalizeText } from "../../core/model/query";
import { PRIORITIES, TASK_STATUSES, TASK_TYPES, type Task, type TaskStatus } from "../../core/model/types";
import { PRIORITY_LABELS, STATUS_LABELS, TYPE_LABELS } from "../labels";
import { Button } from "../ui/Button";
import { ToggleChip } from "../ui/Chip";
import { AUTO_CLOSED_VIEW, type ListParams } from "./list-params";
import styles from "./Toolbar.module.css";

export type ToolbarProps = {
  params: ListParams;
  onChange: (params: ListParams) => void;
  tags: string[];
  epics: Task[];
};

export function Toolbar({ params, onChange, tags, epics }: ToolbarProps) {
  const { filter } = params;
  const pressedStatuses = filter.statuses ?? TASK_STATUSES;
  const setFilter = (patch: Partial<ListParams["filter"]>) => onChange({ ...params, filter: { ...filter, ...patch } });
  const toggleTag = (tag: string) => setFilter({ tags: emptyToUndefined(toggle(filter.tags ?? [], tag)) });

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
          <ToggleChip
            pressed={filter.onlyAutoClosed === true}
            onToggle={() => setFilter(filter.onlyAutoClosed ? { onlyAutoClosed: undefined } : AUTO_CLOSED_VIEW.filter)}
          >
            закрыты агентом
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

      {tags.length > 0 && <TagPicker tags={tags} selected={filter.tags ?? []} onToggle={toggleTag} />}
    </div>
  );
}

function TagPicker({ tags, selected, onToggle }: { tags: string[]; selected: readonly string[]; onToggle: (tag: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const needle = normalizeText(query.trim());
  const summary = selected.length === 0 ? `Теги (${tags.length})` : `Теги (${tags.length}), выбрано ${selected.length}`;

  return (
    <div className={styles.tagPicker}>
      <div className={styles.line}>
        <Button aria-expanded={open} onClick={() => setOpen(!open)}>
          {summary}
        </Button>
        {!open &&
          selected.map((tag) => (
            <ToggleChip key={tag} pressed onToggle={() => onToggle(tag)}>
              #{tag}
            </ToggleChip>
          ))}
      </div>
      {open && (
        <div className={styles.tagPanel}>
          <input
            type="search"
            autoFocus
            value={query}
            placeholder="Найти тег"
            aria-label="Найти тег"
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className={styles.group} role="group" aria-label="Теги">
            {tags
              .filter((tag) => normalizeText(tag).includes(needle))
              .map((tag) => (
                <ToggleChip key={tag} pressed={selected.includes(tag)} onToggle={() => onToggle(tag)}>
                  #{tag}
                </ToggleChip>
              ))}
          </div>
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
