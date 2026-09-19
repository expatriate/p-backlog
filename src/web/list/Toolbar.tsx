import { useState } from "react";
import { normalizeText } from "../../core/model/query";
import { PRIORITIES, TASK_STATUSES, TASK_TYPES, type TaskStatus } from "../../core/model/types";
import { PRIORITY_LABELS, STATUS_LABELS, TYPE_LABELS } from "../labels";
import { ToggleChip } from "../ui/Chip";
import { toggledTags } from "./tag-filter";
import { Popover, POPOVER_INITIAL_FOCUS } from "../ui/Popover";
import { EpicPicker } from "./EpicPicker";
import type { EpicChoices } from "./epic-choices";
import { AUTO_CLOSED_VIEW, type ListParams } from "./list-params";
import styles from "./Toolbar.module.css";

export type ToolbarProps = {
  params: ListParams;
  onChange: (params: ListParams) => void;
  tags: string[];
  epicChoices: EpicChoices;
  autoClosedCount: number;
};

export function Toolbar({ params, onChange, tags, epicChoices, autoClosedCount }: ToolbarProps) {
  const { filter } = params;
  const pressedStatuses = filter.statuses ?? TASK_STATUSES;
  const setFilter = (patch: Partial<ListParams["filter"]>) => onChange({ ...params, filter: { ...filter, ...patch } });
  const toggleTag = (tag: string) => setFilter({ tags: toggledTags(filter.tags ?? [], tag) });
  const toggleAutoClosed = () => {
    if (filter.onlyAutoClosed) setFilter({ onlyAutoClosed: undefined });
    else onChange({ filter: { ...filter, ...AUTO_CLOSED_VIEW.filter }, sort: AUTO_CLOSED_VIEW.sort });
  };

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
            onToggle={toggleAutoClosed}
          >
            закрыты агентом <span className={styles.count}>{autoClosedCount}</span>
          </ToggleChip>
        </div>
      </div>

      {(epicChoices.epics.length > 0 || tags.length > 0) && (
        <div className={styles.line} role="group" aria-label="Эпик и теги">
          {epicChoices.epics.length > 0 && (
            <EpicPicker choices={epicChoices} selected={filter.epic} onSelect={(epic) => setFilter({ epic })} />
          )}
          {tags.length > 0 && <TagPicker tags={tags} selected={filter.tags ?? []} onToggle={toggleTag} />}
        </div>
      )}
    </div>
  );
}

function TagPicker({ tags, selected, onToggle }: { tags: string[]; selected: readonly string[]; onToggle: (tag: string) => void }) {
  const [query, setQuery] = useState("");
  const needle = normalizeText(query.trim());
  const summary = selected.length === 0 ? `Теги (${tags.length})` : `Теги (${tags.length}), выбрано ${selected.length}`;

  return (
    <div className={styles.tagPicker}>
      <Popover trigger={summary}>
        <input
          type="search"
          {...POPOVER_INITIAL_FOCUS}
          className={styles.tagSearch}
          value={query}
          placeholder="Найти тег"
          aria-label="Найти тег"
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className={styles.tagOptions} role="group" aria-label="Теги">
          {tags
            .filter((tag) => normalizeText(tag).includes(needle))
            .map((tag) => (
              <ToggleChip key={tag} pressed={selected.includes(tag)} onToggle={() => onToggle(tag)}>
                #{tag}
              </ToggleChip>
            ))}
        </div>
      </Popover>
      {selected.map((tag) => (
        <ToggleChip key={tag} pressed onToggle={() => onToggle(tag)}>
          #{tag}
        </ToggleChip>
      ))}
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
