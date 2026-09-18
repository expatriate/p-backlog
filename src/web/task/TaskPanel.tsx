import { useLayoutEffect, useState } from "react";
import { Link } from "react-router";
import type { TaskChangesRequest } from "../../core/api/contract";
import { toggleChecklistItem } from "../../core/model/checklist";
import { dependentTasks, epicChildren, isClosed, relatedTasks, taskProgress, type BacklogIndex } from "../../core/model/graph";
import { taskWarnings } from "../../core/model/integrity";
import type { Task } from "../../core/model/types";
import { ApiError } from "../api/client";
import { useUpdateTask } from "../app/queries";
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
import { TaskOptions, TaskRefs, type TaskHref } from "./TaskRefs";
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

export function TaskPanel({ task, tasks, index, taskHref, onClose, tone }: TaskPanelProps) {
  const updateTask = useUpdateTask();
  const [bodyDraft, setBodyDraft] = useState<string | null>(null);
  const now = useNow();
  useLeaveGuard(bodyDraft !== null, LEAVE_WITH_DRAFT);

  const apply = (changes: TaskChangesRequest) => updateTask.mutate({ id: task.id, version: task.version, changes });
  const applyAsync = (changes: TaskChangesRequest) => updateTask.mutateAsync({ id: task.id, version: task.version, changes });
  const conflict = updateTask.error instanceof ApiError && updateTask.error.status === 409;
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

      <TaskFields task={task} epicListId={EPIC_LIST_ID} onChange={apply} />

      <div className={styles.meta}>
        <StatusBadge status={task.status} />
        <ProgressBar progress={taskProgress(task, index)} />
        <span>создана {formatDateTime(task.created)}</span>
        {task.source && <span className={styles.source}>{task.source}</span>}
      </div>

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

      {conflict && (
        <p className={styles.conflict} role="status">
          Задача изменилась на диске, показана актуальная версия. Повторите правку.
        </p>
      )}
      {!conflict && updateTask.error && (
        <p className={styles.conflict} role="status">
          {updateTask.error.message}
        </p>
      )}
      {warnings.length > 0 && (
        <ul className={styles.warnings}>
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      <TaskBody
        body={task.body}
        draft={bodyDraft}
        onDraftChange={setBodyDraft}
        onToggleLine={(line) => apply({ body: toggleChecklistItem(task.body, line) })}
        onSave={(body) => applyAsync({ body })}
      />

      <TaskRefs
        label="Блокируется"
        ids={task.blockedBy}
        tasks={tasks}
        listId={TASK_LIST_ID}
        taskHref={taskHref}
        onChange={(blockedBy) => apply({ blockedBy })}
      />
      <TaskRefs
        label="Связанные"
        ids={task.related}
        tasks={tasks}
        listId={TASK_LIST_ID}
        taskHref={taskHref}
        onChange={(related) => apply({ related })}
      />

      <ReadonlyRefs label="Блокирует" tasks={dependentTasks(task, index)} taskHref={taskHref} />
      <ReadonlyRefs
        label="Ссылаются как на связанную"
        tasks={relatedTasks(task, index).filter((other) => !task.related.includes(other.id))}
        taskHref={taskHref}
      />
      <ReadonlyRefs label="Задачи эпика" tasks={children} taskHref={taskHref} />

      <TaskOptions id={TASK_LIST_ID} tasks={tasks} />
      <TaskOptions id={EPIC_LIST_ID} tasks={tasks.filter((candidate) => candidate.type === "epic")} />
    </SidePanel>
  );
}

function TitleField({ title: serverTitle, onSave }: { title: string; onSave: (title: string) => void }) {
  const [title, setTitle, titleRef] = useDraft<HTMLTextAreaElement>(serverTitle);

  useLayoutEffect(() => {
    const field = titleRef.current;
    if (!field) return;
    const borders = field.offsetHeight - field.clientHeight;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight + borders}px`;
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
      onBlur={() => title !== serverTitle && onSave(title)}
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
          <li key={task.id}>
            <span className={styles.id}>{task.id}</span>{" "}
            <Link to={taskHref(task.id)} className={styles.refLink}>
              {task.title}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
