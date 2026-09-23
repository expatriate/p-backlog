import { useId, useState } from "react";
import { Link, type To } from "react-router";
import { formatId, ID_PATTERN } from "../../core/model/ids";
import type { Task } from "../../core/model/types";
import { Button } from "../ui/Button";
import { CloseIcon } from "../ui/CloseIcon";
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
  idPrefix: string;
  onChange: (update: (ids: readonly string[]) => string[]) => Promise<RefsSaveResult>;
};

export type RefsSaveResult = { saved: true } | { saved: false; fieldError: string | null };

type FieldNotice = { text: string; duplicateOf?: string };

export function TaskRefs({ label, ids, tasks, listId, taskHref, idPrefix, onChange }: TaskRefsProps) {
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<FieldNotice | null>(null);
  const errorId = useId();
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const shownError = notice === null || (notice.duplicateOf !== undefined && !ids.includes(notice.duplicateOf)) ? null : notice.text;
  const showRejection = (result: RefsSaveResult) => {
    if (!result.saved) setNotice(result.fieldError === null ? null : { text: result.fieldError });
  };

  const add = () => {
    const id = normalizeTaskId(draft);
    if (!ID_PATTERN.test(id)) {
      setNotice({ text: `Введите ID задачи, например ${formatId(idPrefix, 12)}` });
      return;
    }
    if (ids.includes(id)) {
      setNotice({ text: `${id} уже в списке`, duplicateOf: id });
      setDraft("");
      return;
    }
    void onChange((current) => [...current, id]).then((result) => {
      if (result.saved) setDraft((typed) => (typed === draft ? "" : typed));
      else showRejection(result);
    });
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
                <Link to={taskHref(id)} className={styles.title}>
                  {task.title}
                </Link>
              ) : (
                <span className={styles.title}>не найдена</span>
              )}
              {task && <StatusBadge status={task.status} />}
              <button type="button" className={styles.remove} aria-label={`Убрать ${id}`} onClick={() => void onChange((current) => current.filter((value) => value !== id)).then(showRejection)}>
                <CloseIcon />
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
          aria-invalid={shownError !== null}
          aria-describedby={shownError === null ? undefined : errorId}
          onChange={(event) => {
            setDraft(event.target.value);
            setNotice(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button onClick={add}>Добавить</Button>
      </div>
      {shownError !== null && (
        <span id={errorId} className={styles.fieldError} role="alert">
          {shownError}
        </span>
      )}
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
