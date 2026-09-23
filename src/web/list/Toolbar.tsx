import { useEffect, useRef, useState, type RefObject } from "react";
import { normalizeText } from "../../core/model/query";
import { PRIORITIES, TASK_STATUSES, TASK_TYPES, type TaskStatus } from "../../core/model/types";
import { TYPE_LABELS } from "../labels";
import { useMessages } from "../i18n";
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
  const { list, core } = useMessages();
  const { filter } = params;
  const pressedStatuses = filter.statuses ?? TASK_STATUSES;
  const setFilter = (patch: Partial<ListParams["filter"]>) => onChange({ ...params, filter: { ...filter, ...patch } });
  const onlyPressedStatus = pressedStatuses.length === 1 ? pressedStatuses[0] : undefined;
  const showEpicPicker = epicChoices.epics.length > 0 || filter.epic !== undefined;
  const epicAndTags = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  useFocusAfterEpicPickerLeaves(showEpicPicker, () => epicAndTags.current?.querySelector("button") ?? search.current);
  const toggleTag = (tag: string) => setFilter({ tags: toggledTags(filter.tags ?? [], tag) });
  const toggleAutoClosed = () => {
    if (filter.onlyAutoClosed) setFilter({ onlyAutoClosed: undefined });
    else onChange({ filter: { ...filter, ...AUTO_CLOSED_VIEW.filter }, sort: AUTO_CLOSED_VIEW.sort });
  };

  return (
    <div className={styles.toolbar}>
      <div className={styles.line}>
        <SearchField ref={search} query={filter.query ?? ""} onChange={(query) => setFilter({ query: query || undefined })} />
      </div>

      <div className={styles.line}>
        <div className={styles.group} role="group" aria-label={list.status}>
          {TASK_STATUSES.map((status) => (
            <ToggleChip
              key={status}
              pressed={pressedStatuses.includes(status)}
              locked={status === onlyPressedStatus}
              onToggle={() => setFilter({ statuses: allOrSome(toggle(pressedStatuses, status)) })}
            >
              {core.statusLabel(status)}
            </ToggleChip>
          ))}
        </div>
        <div className={styles.group} role="group" aria-label={list.priority}>
          {PRIORITIES.map((priority) => (
            <ToggleChip
              key={priority}
              pressed={filter.priorities?.includes(priority) ?? false}
              onToggle={() => setFilter({ priorities: emptyToUndefined(toggle(filter.priorities ?? [], priority)) })}
            >
              {core.priorityLabel(priority)}
            </ToggleChip>
          ))}
        </div>
        <div className={styles.group} role="group" aria-label={list.type}>
          {TASK_TYPES.map((type) => (
            <ToggleChip key={type} pressed={filter.type === type} onToggle={() => setFilter({ type: filter.type === type ? undefined : type })}>
              {TYPE_LABELS[type]}
            </ToggleChip>
          ))}
          <ToggleChip pressed={filter.onlyUnblocked === true} onToggle={() => setFilter({ onlyUnblocked: filter.onlyUnblocked ? undefined : true })}>
            {list.withoutBlockers}
          </ToggleChip>
          <ToggleChip
            pressed={filter.onlyAutoClosed === true}
            onToggle={toggleAutoClosed}
          >
            {list.autoClosedChip} <span className={styles.count}>{autoClosedCount}</span>
          </ToggleChip>
        </div>
      </div>

      {(showEpicPicker || tags.length > 0) && (
        <div ref={epicAndTags} className={styles.line} role="group" aria-label={list.epicAndTags}>
          {showEpicPicker && (
            <EpicPicker choices={epicChoices} selected={filter.epic} onSelect={(epic) => setFilter({ epic })} />
          )}
          {tags.length > 0 && <TagPicker tags={tags} selected={filter.tags ?? []} onToggle={toggleTag} />}
        </div>
      )}
    </div>
  );
}

type SearchEditing = { text: string; sent: ReadonlySet<string> };

function useFocusAfterEpicPickerLeaves(shown: boolean, nextTarget: () => HTMLElement | null): void {
  const wasShown = useRef(shown);
  useEffect(() => {
    const left = wasShown.current && !shown;
    wasShown.current = shown;
    if (left && document.activeElement === document.body) nextTarget()?.focus();
  });
}

function SearchField({ ref, query, onChange }: { ref: RefObject<HTMLInputElement | null>; query: string; onChange: (query: string) => void }) {
  const { list } = useMessages();
  const [editing, setEditing] = useState<SearchEditing>();
  const [seenQuery, setSeenQuery] = useState(query);
  if (query !== seenQuery) {
    setSeenQuery(query);
    if (editing !== undefined && !editing.sent.has(query)) setEditing({ text: query, sent: new Set() });
  }

  return (
    <input
      ref={ref}
      type="search"
      className={styles.search}
      value={editing?.text ?? query}
      placeholder={list.searchPlaceholder}
      aria-label={list.searchLabel}
      onFocus={() => setEditing({ text: query, sent: new Set() })}
      onBlur={() => setEditing(undefined)}
      onChange={(event) => {
        const text = event.target.value;
        setEditing((current) => ({ text, sent: new Set([...(current?.sent ?? []), text]) }));
        onChange(text);
      }}
    />
  );
}

function TagPicker({ tags, selected, onToggle }: { tags: string[]; selected: readonly string[]; onToggle: (tag: string) => void }) {
  const { list } = useMessages();
  const [query, setQuery] = useState("");
  const needle = normalizeText(query.trim());
  const summary = selected.length === 0 ? list.tagsSummary(tags.length) : list.tagsSummarySelected(tags.length, selected.length);

  return (
    <div className={styles.tagPicker}>
      <Popover trigger={summary}>
        <input
          type="search"
          {...POPOVER_INITIAL_FOCUS}
          className={styles.tagSearch}
          value={query}
          placeholder={list.findTag}
          aria-label={list.findTag}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className={styles.tagOptions} role="group" aria-label={list.tags}>
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
