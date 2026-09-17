import { useState, type FormEvent } from "react";
import { PRIORITIES, TASK_TYPES, type Priority, type TaskType } from "../../core/model/types";
import { useCreateTask, useProjects } from "../app/queries";
import { PRIORITY_LABELS, TYPE_LABELS } from "../labels";
import { SidePanel } from "../ui/SidePanel";
import styles from "./NewTaskForm.module.css";

export function NewTaskForm({ projectId, onClose }: { projectId?: string; onClose: () => void }) {
  const projects = useProjects();
  const createTask = useCreateTask();
  const [project, setProject] = useState(projectId ?? "");
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("task");
  const [priority, setPriority] = useState<Priority>("medium");
  const [tags, setTags] = useState("");
  const [body, setBody] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    createTask.mutate(
      {
        projectId: project,
        title,
        type,
        priority,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        body: body || undefined,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <SidePanel label="Новая задача" heading={<h2 className={styles.heading}>Новая задача</h2>} onClose={onClose}>
      <form className={styles.form} onSubmit={submit}>
        {projectId === undefined && (
          <label>
            Проект
            <select value={project} required onChange={(event) => setProject(event.target.value)}>
              <option value="" disabled>
                выберите проект
              </option>
              {(projects.data ?? []).map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Название
          <input value={title} required autoFocus onChange={(event) => setTitle(event.target.value)} />
        </label>
        <div className={styles.row}>
          <label>
            Тип
            <select value={type} onChange={(event) => setType(event.target.value as TaskType)}>
              {TASK_TYPES.map((value) => (
                <option key={value} value={value}>
                  {TYPE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Приоритет
            <select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
              {PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {PRIORITY_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Теги через запятую
          <input value={tags} onChange={(event) => setTags(event.target.value)} />
        </label>
        <label>
          Описание
          <textarea value={body} rows={10} onChange={(event) => setBody(event.target.value)} />
        </label>
        {createTask.error && <p className={styles.error}>{createTask.error.message}</p>}
        <button type="submit" className={styles.submit} disabled={createTask.isPending}>
          Создать задачу
        </button>
      </form>
    </SidePanel>
  );
}
