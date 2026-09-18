import { useState } from "react";
import { Link, type To } from "react-router";
import type { Task } from "../../core/model/types";
import { Button } from "../ui/Button";
import { StatusBadge } from "../ui/StatusBadge";
import { normalizeTaskId } from "./normalize-task-id";
import styles from "./TaskRefs.module.css";

export type TaskHref = (id: string) => To;

export type TaskRefsProps = {
  label: string;
  ids: readonly string[];
  tasks: readonly Task[];
  listId: string;
  taskHref: TaskHref;
  onChange: (ids: string[]) => void;
};

export function TaskRefs({ label, ids, tasks, listId, taskHref, onChange }: TaskRefsProps) {
  const [draft, setDraft] = useState("");
  const byId = new Map(tasks.map((task) => [task.id, task]));

  const add = () => {
    const id = normalizeTaskId(draft);
    if (id === "" || ids.includes(id)) return;
    onChange([...ids, id]);
    setDraft("");
  };

  return (
    <section className={styles.section} aria-label={label}>
      <h2 className={styles.heading}>{label}</h2>
      <ul className={styles.items}>
        {ids.map((id) => {
          const task = byId.get(id);
          return (
            <li key={id} className={styles.item}>
              <span className={styles.id}>{id}</span>
              {task ? (
                <Link to={taskHref(id)} className={styles.title} title={task.title}>
                  {task.title}
                </Link>
              ) : (
                <span className={styles.title}>не найдена</span>
              )}
              {task && <StatusBadge status={task.status} />}
              <button type="button" className={styles.remove} aria-label={`Убрать ${id}`} onClick={() => onChange(ids.filter((value) => value !== id))}>
                ×
              </button>
            </li>
          );
        })}
      </ul>
      <div className={styles.add}>
        <input
          list={listId}
          value={draft}
          placeholder="ID задачи"
          aria-label={`Добавить в «${label}»`}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button onClick={add}>Добавить</Button>
      </div>
    </section>
  );
}

export function TaskOptions({ id, tasks }: { id: string; tasks: readonly Task[] }) {
  return (
    <datalist id={id}>
      {tasks.map((task) => (
        <option key={task.id} value={task.id}>
          {task.title}
        </option>
      ))}
    </datalist>
  );
}
