import type { TaskChangesRequest } from "../../core/api/contract";
import { CATEGORY_LABELS, NO_CATEGORY_LABEL } from "../../core/model/categories";
import {
  PRIORITIES,
  TASK_CATEGORIES,
  TASK_STATUSES,
  TASK_TYPES,
  type Task,
} from "../../core/model/types";
import { PRIORITY_LABELS, STATUS_LABELS, TYPE_LABELS } from "../labels";
import { useDraft } from "../ui/use-draft";
import { normalizeTaskId } from "./normalize-task-id";
import styles from "./TaskFields.module.css";

export type TaskFieldsProps = { task: Task; epicListId: string; onChange: (changes: TaskChangesRequest) => void };

export function TaskFields({ task, epicListId, onChange }: TaskFieldsProps) {
  const [tags, setTags, tagsRef] = useDraft(task.tags.join(", "));
  const [epic, setEpic, epicRef] = useDraft(task.epic ?? "");

  return (
    <>
      <div className={styles.grid}>
        <ChoiceSelect label="Статус" value={task.status} choices={TASK_STATUSES} labels={STATUS_LABELS} onChange={(status) => status !== null && onChange({ status })} />
        <ChoiceSelect label="Приоритет" value={task.priority} choices={PRIORITIES} labels={PRIORITY_LABELS} onChange={(priority) => priority !== null && onChange({ priority })} />
        <ChoiceSelect
          label="Категория"
          value={task.category}
          choices={TASK_CATEGORIES}
          labels={CATEGORY_LABELS}
          emptyLabel={NO_CATEGORY_LABEL}
          onChange={(category) => onChange({ category })}
        />
        <ChoiceSelect label="Тип" value={task.type} choices={TASK_TYPES} labels={TYPE_LABELS} onChange={(type) => type !== null && onChange({ type })} />
        <label>
          Эпик
          <input
            ref={epicRef}
            list={epicListId}
            value={epic}
            placeholder="ID эпика"
            onChange={(event) => setEpic(event.target.value)}
            onBlur={() => {
              const value = normalizeTaskId(epic);
              if (value !== (task.epic ?? "")) onChange({ epic: value === "" ? null : value });
            }}
          />
        </label>
      </div>

      <label className={styles.tags}>
        Теги через запятую
        <input ref={tagsRef} value={tags} onChange={(event) => setTags(event.target.value)} onBlur={() => saveTags(tags, task, onChange)} />
      </label>
    </>
  );
}

type ChoiceSelectProps<T extends string> = {
  label: string;
  value: T | undefined;
  choices: readonly T[];
  labels: Record<T, string>;
  emptyLabel?: string;
  onChange: (value: T | null) => void;
};

function ChoiceSelect<T extends string>({ label, value, choices, labels, emptyLabel, onChange }: ChoiceSelectProps<T>) {
  return (
    <label>
      {label}
      <select value={value ?? ""} onChange={(event) => onChange(choices.find((choice) => choice === event.target.value) ?? null)}>
        {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {labels[choice]}
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
