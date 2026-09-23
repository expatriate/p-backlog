import { useEffect, useLayoutEffect, useState } from "react";
import { Link } from "react-router";
import type { TaskChangesRequest } from "../../core/api/contract";
import { toggleChecklistItem } from "../../core/model/checklist";
import { dependentTasks, epicChildren, isClosed, relatedTasks, taskProgress, type BacklogIndex } from "../../core/model/graph";
import { parseId } from "../../core/model/ids";
import { taskWarnings } from "../../core/model/integrity";
import type { Task } from "../../core/model/types";
import { ApiError } from "../api/client";
import { useUpdateTask, type BodyEdit, type TaskChange } from "../app/queries";
import { formatDateTime, RESOLUTION_LABELS } from "../labels";
import { Button } from "../ui/Button";
import { Countdown } from "../ui/Countdown";
import { ProgressBar } from "../ui/ProgressBar";
import { useDraft } from "../ui/use-draft";
import { useLeaveGuard } from "../ui/use-leave-guard";
import { SidePanel } from "../ui/SidePanel";
import { StatusBadge } from "../ui/StatusBadge";
import { useNow } from "../ui/use-now";
import { TaskBody } from "./TaskBody";
import { TaskFields } from "./TaskFields";
import { TaskOptions, TaskRefs, type RefsSaveResult, type TaskHref } from "./TaskRefs";
import styles from "./TaskPanel.module.css";

export type TaskPanelProps = {
  task: Task;
  tasks: readonly Task[];
  index: BacklogIndex;
  taskHref: TaskHref;
  onClose: () => void;
  tone: number | undefined;
};

const TASK_LIST_ID = "task-ids";
const EPIC_LIST_ID = "epic-ids";
const LEAVE_WITH_DRAFT = "Уйти без сохранения описания?";

type BodyDraft = { text: string; from: BodyEdit };

export function TaskPanel({ task, tasks, index, taskHref, onClose, tone }: TaskPanelProps) {
  const updateTask = useUpdateTask();
  const [bodyDraft, setBodyDraft] = useState<BodyDraft | null>(null);
  const now = useNow();
  useLeaveGuard(bodyDraft !== null, LEAVE_WITH_DRAFT);

  const [bodySaving, setBodySaving] = useState(false);
  const [bodyError, setBodyError] = useState<Error | null>(null);
  const [saveError, setSaveError] = useState<Error | null>(null);
  const cardAlerts = cardAlertTexts(bodyError, saveError, bodyDraft !== null);

  const saveNote = useSaveNote(updateTask.isPending, updateTask.isSuccess && cardAlerts.length === 0, updateTask.submittedAt);
  const save = (change: TaskChange) => {
    setSaveError(null);
    void updateTask.mutateAsync({ id: task.id, change }).catch((error: unknown) => setSaveError(asError(error)));
  };
  const apply = (changes: TaskChangesRequest) => save(() => changes);
  const saveRefs = async (change: TaskChange): Promise<RefsSaveResult> => {
    setSaveError(null);
    try {
      await updateTask.mutateAsync({ id: task.id, change });
      return { saved: true };
    } catch (error) {
      if (!isConflict(error)) return { saved: false, fieldError: asError(error).message };
      setSaveError(asError(error));
      return { saved: false, fieldError: null };
    }
  };
  const bodyOrigin = bodyDraft?.from ?? { version: task.version, body: task.body };
  const editBody = (text: string | null) => {
    if (text === null) setBodyError(null);
    setBodyDraft(text === null ? null : { text, from: bodyOrigin });
  };
  const saveBody = async (text: string) => {
    setBodySaving(true);
    setBodyError(null);
    setSaveError(null);
    try {
      await updateTask.mutateAsync({ id: task.id, change: () => ({ body: text }), bodyEdit: bodyOrigin });
    } catch (error) {
      setBodyError(asError(error));
      if (error instanceof ApiError && error.current !== undefined) {
        const from = { version: error.current.version, body: error.current.body };
        setBodyDraft((draft) => draft && { ...draft, from });
      }
      throw error;
    } finally {
      setBodySaving(false);
    }
  };
  const idPrefix = parseId(task.id)?.prefix ?? task.id;
  const warnings = taskWarnings(task, index);
  const children = task.type === "epic" ? epicChildren(task, index) : [];

  return (
    <SidePanel
      label={`Задача ${task.id}`}
      heading={
        <span className={styles.id} data-epic-tone={tone}>
          {task.id}
        </span>
      }
      onClose={onClose}
    >
      <TitleField title={task.title} onSave={(title) => apply({ title })} />

      <TaskFields task={task} epicListId={EPIC_LIST_ID} knownTasks={tasks} onChange={apply} />

      <div className={styles.meta}>
        <StatusBadge status={task.status} />
        <ProgressBar progress={taskProgress(task, index)} />
        <span>создана {formatDateTime(task.created)}</span>
        {task.source && <span className={styles.source}>{task.source}</span>}
      </div>

      <p className={styles.saving} role="status">
        {saveNote}
      </p>

      {isClosed(task.status) && (
        <div className={styles.closure}>
          <p>
            Закрыта{task.closed === undefined ? "" : ` ${formatDateTime(task.closed)}`}
            {task.resolution !== undefined && ` · ${RESOLUTION_LABELS[task.resolution]} — ${task.reason ?? ""}`}
          </p>
          <Countdown task={task} now={now} />
          <Button className={styles.restore} onClick={() => apply({ status: "backlog" })}>
            Вернуть в беклог
          </Button>
        </div>
      )}

      {cardAlerts.map((text) => (
        <p key={text} className={styles.conflict} role="alert">
          {text}
        </p>
      ))}
      {warnings.length > 0 && (
        <ul className={styles.warnings}>
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      <TaskBody
        body={task.body}
        draft={bodyDraft?.text ?? null}
        saving={bodySaving}
        onDraftChange={editBody}
        onToggleLine={(line) => save((fresh) => ({ body: toggleChecklistItem(fresh.body, line) }))}
        onSave={saveBody}
      />

      <TaskRefs
        label="Блокируется"
        ids={task.blockedBy}
        tasks={tasks}
        listId={TASK_LIST_ID}
        taskHref={taskHref}
        idPrefix={idPrefix}
        onChange={(update) => saveRefs((fresh) => ({ blockedBy: update(fresh.blockedBy) }))}
      />
      <TaskRefs
        label="Связанные"
        ids={task.related}
        tasks={tasks}
        listId={TASK_LIST_ID}
        taskHref={taskHref}
        idPrefix={idPrefix}
        onChange={(update) => saveRefs((fresh) => ({ related: update(fresh.related) }))}
      />

      <ReadonlyRefs label="Блокирует" tasks={dependentTasks(task, index)} taskHref={taskHref} />
      <ReadonlyRefs
        label="Ссылаются как на связанную"
        tasks={relatedTasks(task, index).filter((other) => !task.related.includes(other.id))}
        taskHref={taskHref}
      />
      <ReadonlyRefs label="Задачи эпика" tasks={children} taskHref={taskHref} />

      <TaskOptions id={TASK_LIST_ID} tasks={tasks.filter((other) => other.id !== task.id)} />
      <TaskOptions id={EPIC_LIST_ID} tasks={tasks.filter((candidate) => candidate.type === "epic")} />
    </SidePanel>
  );
}

const DRAFT_CONFLICT = "Описание изменилось на диске, пока вы его правили. «Сохранить» перезапишет его вашим текстом, «Отмена» покажет актуальное.";
const TASK_CONFLICT = "Задача изменилась на диске, показана актуальная версия. Повторите правку.";

function cardAlertTexts(bodyError: Error | null, saveError: Error | null, draftOpen: boolean): string[] {
  const bodyText = bodyError === null ? null : isConflict(bodyError) && draftOpen ? DRAFT_CONFLICT : errorText(bodyError);
  const saveText = saveError === null ? null : errorText(saveError);
  return [...new Set([bodyText, saveText].filter((text) => text !== null))];
}

function errorText(error: Error): string {
  return isConflict(error) ? TASK_CONFLICT : error.message;
}

function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

const SAVED_NOTE_MS = 2000;

function useSaveNote(pending: boolean, success: boolean, submittedAt: number): string {
  const [fadedSave, setFadedSave] = useState<number | null>(null);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setFadedSave(submittedAt), SAVED_NOTE_MS);
    return () => clearTimeout(timer);
  }, [success, submittedAt]);

  if (pending) return "Сохраняем…";
  return success && fadedSave !== submittedAt ? "Сохранено" : "";
}

function TitleField({ title: serverTitle, onSave }: { title: string; onSave: (title: string) => void }) {
  const [title, setTitle, titleRef] = useDraft<HTMLTextAreaElement>(serverTitle);

  useLayoutEffect(() => {
    const field = titleRef.current;
    if (!field) return;
    const fit = () => {
      const borders = field.offsetHeight - field.clientHeight;
      field.style.height = "auto";
      field.style.height = `${field.scrollHeight + borders}px`;
    };
    fit();
    const box = field.parentElement;
    if (!box) return;
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [title, titleRef]);

  return (
    <textarea
      ref={titleRef}
      className={styles.title}
      rows={1}
      value={title}
      aria-label="Название задачи"
      onChange={(event) => setTitle(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      onBlur={() => {
        const next = title.trim();
        if (next === "") setTitle(serverTitle);
        else if (next !== serverTitle) onSave(next);
      }}
    />
  );
}

function ReadonlyRefs({ label, tasks, taskHref }: { label: string; tasks: readonly Task[]; taskHref: TaskHref }) {
  if (tasks.length === 0) return null;
  return (
    <section className={styles.readonlyRefs} aria-label={label}>
      <h2>{label}</h2>
      <ul>
        {tasks.map((task) => (
          <li key={task.id} className={isClosed(task.status) ? styles.refClosed : undefined}>
            <span className={styles.id}>{task.id}</span>{" "}
            <Link to={taskHref(task.id)} className={styles.refLink}>
              {task.title}
            </Link>{" "}
            <StatusBadge status={task.status} />
          </li>
        ))}
      </ul>
    </section>
  );
}
