import type { TaskChangesRequest } from "../../core/api/contract";
import { PRIORITIES, TASK_STATUSES, TASK_TYPES, type Priority, type Task, type TaskStatus, type TaskType } from "../../core/model/types";
import { PRIORITY_LABELS, STATUS_LABELS, TYPE_LABELS } from "../labels";
import { useDraft } from "../ui/use-draft";
import { normalizeTaskId } from "./normalize-task-id";
import styles from "./TaskFields.module.css";

export type TaskFieldsProps = { task: Task; optionsId: string; onChange: (changes: TaskChangesRequest) => void };

export function TaskFields({ task, optionsId, onChange }: TaskFieldsProps) {
  const [tags, setTags, tagsRef] = useDraft(task.tags.join(", "));
  const [epic, setEpic, epicRef] = useDraft(task.epic ?? "");

  return (
    <>
      <div className={styles.grid}>
        <label>
          Статус
          <select value={task.status} onChange={(event) => onChange({ status: event.target.value as TaskStatus })}>
            {TASK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Приоритет
          <select value={task.priority} onChange={(event) => onChange({ priority: event.target.value as Priority })}>
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABELS[priority]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Тип
          <select value={task.type} onChange={(event) => onChange({ type: event.target.value as TaskType })}>
            {TASK_TYPES.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Эпик
          <input
            ref={epicRef}
            list={optionsId}
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

function saveTags(value: string, task: Task, onChange: (changes: TaskChangesRequest) => void): void {
  const tags = value
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
  if (tags.join(",") !== task.tags.join(",")) onChange({ tags });
}
