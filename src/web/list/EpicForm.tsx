import { useState, type FormEvent } from "react";
import { PRIORITIES, type Priority, type Task } from "../../core/model/types";
import { useCreateEpic } from "../app/queries";
import { PRIORITY_LABELS } from "../labels";
import styles from "./EpicForm.module.css";

export function EpicForm({ tasks, onDone }: { tasks: Task[]; onDone: () => void }) {
  const createEpic = useCreateEpic();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [body, setBody] = useState("");

  const projectIds = [...new Set(tasks.map((task) => task.projectId))];
  const mixedProjects = projectIds.length > 1;
  const alreadyInEpic = tasks.filter((task) => task.epic !== undefined);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const projectId = projectIds[0];
    if (projectId === undefined) return;
    createEpic.mutate(
      { projectId, title, priority, body: body || undefined, taskIds: tasks.map((task) => task.id) },
      {
        onSuccess: () => {
          setOpen(false);
          setTitle("");
          setBody("");
          onDone();
        },
      },
    );
  };

  return (
    <section className={styles.bar} aria-label="Выбранные задачи">
      <div className={styles.summary}>
        <span>Выбрано задач: {tasks.length}</span>
        {mixedProjects ? (
          <span className={styles.note}>Задачи из разных проектов — эпик собрать нельзя</span>
        ) : (
          <button type="button" className={styles.action} onClick={() => setOpen(!open)}>
            {open ? "Отмена" : "Собрать в эпик"}
          </button>
        )}
      </div>

      {open && !mixedProjects && (
        <form className={styles.form} onSubmit={submit}>
          {alreadyInEpic.length > 0 && (
            <p className={styles.note}>
              У {alreadyInEpic.map((task) => task.id).join(", ")} уже есть эпик — он будет заменён.
            </p>
          )}
          <label className={styles.field}>
            Название эпика
            <input value={title} onChange={(event) => setTitle(event.target.value)} required autoFocus />
          </label>
          <label className={styles.field}>
            Приоритет
            <select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
              {PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {PRIORITY_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            Описание
            <textarea value={body} rows={2} onChange={(event) => setBody(event.target.value)} />
          </label>
          {createEpic.error && <p className={styles.error}>{createEpic.error.message}</p>}
          <button type="submit" className={styles.action} disabled={createEpic.isPending}>
            Создать эпик
          </button>
        </form>
      )}
    </section>
  );
}
