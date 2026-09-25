import { useId, useState, type RefObject } from "react";
import type { TaskChangesRequest } from "../../core/api/contract";
import { epicProblems } from "../../core/model/integrity";
import { PRIORITIES, TASK_CATEGORIES, TASK_STATUSES, TASK_TYPES, type Task } from "../../core/model/types";
import { useMessages } from "../i18n";
import type { Draft } from "../ui/use-draft";
import { normalizeTaskId } from "./normalize-task-id";
import styles from "./TaskFields.module.css";

export type TaskFieldsProps = {
  task: Task;
  epicListId: string;
  knownTasks: readonly Task[];
  onChange: (changes: TaskChangesRequest) => Promise<boolean>;
  tags: Draft;
  tagsRef: RefObject<HTMLInputElement | null>;
  epic: Draft;
  epicRef: RefObject<HTMLInputElement | null>;
};

export function TaskFields({ task, epicListId, knownTasks, onChange, tags, tagsRef, epic, epicRef }: TaskFieldsProps) {
  const { core, task: t } = useMessages();
  const [epicError, setEpicError] = useState<string | null>(null);
  const epicErrorId = useId();

  const saveEpic = () => {
    const value = normalizeTaskId(epic.value);
    const resolve = (id: string) => knownTasks.find((known) => known.id === id);
    const problems = value === "" ? [] : epicProblems({ ...task, epic: value }, resolve);
    setEpicError(problems.length === 0 ? null : core.problems(problems));
    if (problems.length > 0) return;
    epic.commit((next) => onChange({ epic: next === "" ? null : next }));
  };

  const saveTags = () => tags.commit(() => onChange({ tags: parseTags(tags.value) }));

  return (
    <>
      <div className={styles.grid}>
        <ChoiceSelect label={t.statusField} value={task.status} choices={TASK_STATUSES} labelFor={core.statusLabel} onChange={(status) => status !== null && void onChange({ status })} />
        <ChoiceSelect label={t.priorityField} value={task.priority} choices={PRIORITIES} labelFor={core.priorityLabel} onChange={(priority) => priority !== null && void onChange({ priority })} />
        <ChoiceSelect
          label={t.categoryField}
          value={task.category}
          choices={TASK_CATEGORIES}
          labelFor={core.categoryLabel}
          emptyLabel={core.categoryLabel(undefined)}
          onChange={(category) => void onChange({ category })}
        />
        <ChoiceSelect label={t.typeField} value={task.type} choices={TASK_TYPES} labelFor={(type) => t.typeLabels[type]} onChange={(type) => type !== null && void onChange({ type })} />
        <label>
          {t.epicField}
          <input
            ref={epicRef}
            list={epicListId}
            value={epic.value}
            placeholder={t.epicPlaceholder}
            aria-invalid={epicError !== null}
            aria-describedby={epicError === null ? undefined : epicErrorId}
            onChange={(event) => {
              epic.set(event.target.value);
              setEpicError(null);
            }}
            onBlur={saveEpic}
          />
          {epicError !== null && (
            <span id={epicErrorId} className={styles.fieldError} role="alert">
              {epicError}
            </span>
          )}
        </label>
      </div>

      <label className={styles.tags}>
        {t.tagsField}
        <input ref={tagsRef} value={tags.value} onChange={(event) => tags.set(event.target.value)} onBlur={saveTags} />
      </label>
    </>
  );
}

type ChoiceSelectProps<T extends string> = {
  label: string;
  value: T | undefined;
  choices: readonly T[];
  labelFor: (choice: T) => string;
  emptyLabel?: string;
  onChange: (value: T | null) => void;
};

function ChoiceSelect<T extends string>({ label, value, choices, labelFor, emptyLabel, onChange }: ChoiceSelectProps<T>) {
  return (
    <label>
      {label}
      <select value={value ?? ""} onChange={(event) => onChange(choices.find((choice) => choice === event.target.value) ?? null)}>
        {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {labelFor(choice)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function canonicalTags(value: string): string {
  return parseTags(value).join(", ");
}

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}
