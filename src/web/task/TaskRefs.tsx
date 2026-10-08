import { useId, useState } from "react";
import { Link } from "react-router";
import { formatId, ID_PATTERN } from "../../core/model/ids";
import type { Task } from "../../core/model/types";
import { useAllTasks } from "../app/all-tasks";
import { useTaskHref } from "../app/use-task-href";
import { useMessages } from "../i18n";
import { Button } from "../ui/Button";
import { CloseIcon } from "../ui/CloseIcon";
import { StatusBadge } from "../ui/StatusBadge";
import { normalizeTaskId } from "./normalize-task-id";
import type { RefsSaveResult } from "./use-task-saving";
import styles from "./TaskRefs.module.css";

export type TaskRefsProps = {
  label: string;
  ids: readonly string[];
  listId: string;
  idPrefix: string;
  onChange: (update: (ids: readonly string[]) => string[]) => Promise<RefsSaveResult>;
};

const EXAMPLE_TASK_NUMBER = 12;

type FieldNotice = { text: string; duplicateOf?: string };

export function TaskRefs({ label, ids, listId, idPrefix, onChange }: TaskRefsProps) {
  const { task: taskMessages } = useMessages();
  const { index } = useAllTasks();
  const taskHref = useTaskHref();
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<FieldNotice | null>(null);
  const errorId = useId();
  const shownError = notice === null || (notice.duplicateOf !== undefined && !ids.includes(notice.duplicateOf)) ? null : notice.text;
  const showRejection = (result: RefsSaveResult) => {
    if (!result.saved) setNotice(result.fieldError === null ? null : { text: result.fieldError });
  };

  const add = () => {
    const id = normalizeTaskId(draft);
    if (!ID_PATTERN.test(id)) {
      setNotice({ text: taskMessages.invalidRefId(formatId(idPrefix, EXAMPLE_TASK_NUMBER)) });
      return;
    }
    if (ids.includes(id)) {
      setNotice({ text: taskMessages.duplicateRef(id), duplicateOf: id });
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
          const task = index.byId.get(id);
          return (
            <li key={id} className={styles.item}>
              <span className={styles.id}>{id}</span>
              {task ? (
                <Link to={taskHref(id)} className={styles.title}>
                  {task.title}
                </Link>
              ) : (
                <span className={styles.title}>{taskMessages.refNotFound}</span>
              )}
              {task && <StatusBadge status={task.status} />}
              <button type="button" className={styles.remove} aria-label={taskMessages.removeRef(id)} onClick={() => void onChange((current) => current.filter((value) => value !== id)).then(showRejection)}>
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
          placeholder={taskMessages.addRefPlaceholder}
          aria-label={taskMessages.addRefLabel(label)}
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
        <Button onClick={add}>{taskMessages.addRef}</Button>
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
