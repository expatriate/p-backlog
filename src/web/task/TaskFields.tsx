import { useId, useState } from "react";
import type { TaskChangesRequest } from "../../core/api/contract";
import { epicProblems } from "../../core/model/integrity";
import { PRIORITIES, TASK_CATEGORIES, TASK_STATUSES, TASK_TYPES, type Task } from "../../core/model/types";
import { useMessages } from "../i18n";
import { useDraft } from "../ui/use-draft";
import { normalizeTaskId } from "./normalize-task-id";
import styles from "./TaskFields.module.css";

export type TaskFieldsProps = { task: Task; epicListId: string; knownTasks: readonly Task[]; onChange: (changes: TaskChangesRequest) => void };

export function TaskFields({ task, epicListId, knownTasks, onChange }: TaskFieldsProps) {
  const { core, task: t } = useMessages();
  const [tags, setTags, tagsRef] = useDraft(task.tags.join(", "));
  const [epic, setEpic, epicRef] = useDraft(task.epic ?? "");
  const [epicError, setEpicError] = useState<string | null>(null);
  const epicErrorId = useId();

  const saveEpic = () => {
    const value = normalizeTaskId(epic);
    const resolve = (id: string) => knownTasks.find((known) => known.id === id);
    const problems = value === "" ? [] : epicProblems({ ...task, epic: value }, resolve);
    setEpicError(problems.length === 0 ? null : core.problems(problems));
    if (problems.length > 0) return;
    if (value !== (task.epic ?? "")) onChange({ epic: value === "" ? null : value });
  };

  return (
    <>
      <div className={styles.grid}>
        <ChoiceSelect label={t.statusField} value={task.status} choices={TASK_STATUSES} labelFor={core.statusLabel} onChange={(status) => status !== null && onChange({ status })} />
        <ChoiceSelect label={t.priorityField} value={task.priority} choices={PRIORITIES} labelFor={core.priorityLabel} onChange={(priority) => priority !== null && onChange({ priority })} />
        <ChoiceSelect
          label={t.categoryField}
          value={task.category}
          choices={TASK_CATEGORIES}
          labelFor={core.categoryLabel}
          emptyLabel={core.categoryLabel(undefined)}
          onChange={(category) => onChange({ category })}
        />
        <ChoiceSelect label={t.typeField} value={task.type} choices={TASK_TYPES} labelFor={(type) => t.typeLabels[type]} onChange={(type) => type !== null && onChange({ type })} />
        <label>
          {t.epicField}
          <input
            ref={epicRef}
            list={epicListId}
            value={epic}
            placeholder={t.epicPlaceholder}
            aria-invalid={epicError !== null}
            aria-describedby={epicError === null ? undefined : epicErrorId}
            onChange={(event) => {
              setEpic(event.target.value);
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
        <input ref={tagsRef} value={tags} onChange={(event) => setTags(event.target.value)} onBlur={() => saveTags(tags, task, onChange)} />
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

function saveTags(value: string, task: Task, onChange: (changes: TaskChangesRequest) => void): void {
  const tags = value
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
  if (tags.join(",") !== task.tags.join(",")) onChange({ tags });
}
