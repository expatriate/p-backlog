import { useState } from "react";
import { formatId, ID_PATTERN } from "../../core/model/ids";
import type { Task } from "../../core/model/types";
import { useMessages } from "../i18n";
import { Button } from "../ui/Button";
import { CloseIcon } from "../ui/CloseIcon";
import { FieldError, useFieldError } from "../ui/FieldError";
import { IconButton } from "../ui/IconButton";
import { normalizeTaskId } from "./normalize-task-id";
import { TaskRef } from "./TaskRef";
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
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<FieldNotice | null>(null);
  const addField = useFieldError(shownNoticeText(notice, ids));
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
      <RefItems ids={ids} onRemove={(removed) => void onChange((current) => current.filter((id) => id !== removed)).then(showRejection)} />
      <div className={styles.add}>
        <input
          list={listId}
          value={draft}
          placeholder={taskMessages.addRefPlaceholder}
          aria-label={taskMessages.addRefLabel(label)}
          {...addField.inputProps}
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
      <FieldError {...addField.error} />
    </section>
  );
}

function RefItems({ ids, onRemove }: { ids: readonly string[]; onRemove: (id: string) => void }) {
  const { task: taskMessages } = useMessages();
  return (
    <ul className={styles.items}>
      {ids.map((id) => (
        <li key={id} className={styles.item}>
          <TaskRef id={id} />
          <IconButton label={taskMessages.removeRef(id)} tone="danger" onClick={() => onRemove(id)}>
            <CloseIcon />
          </IconButton>
        </li>
      ))}
    </ul>
  );
}

function shownNoticeText(notice: FieldNotice | null, ids: readonly string[]): string | null {
  if (notice === null) return null;
  const duplicateRemovedSince = notice.duplicateOf !== undefined && !ids.includes(notice.duplicateOf);
  return duplicateRemovedSince ? null : notice.text;
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
