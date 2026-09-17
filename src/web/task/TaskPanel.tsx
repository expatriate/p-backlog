import type { TaskChangesRequest } from "../../core/api/contract";
import { toggleChecklistItem } from "../../core/model/checklist";
import { dependentTasks, epicChildren, relatedTasks, taskProgress, type BacklogIndex } from "../../core/model/graph";
import { taskWarnings } from "../../core/model/integrity";
import type { Task } from "../../core/model/types";
import { ApiError } from "../api/client";
import { useUpdateTask } from "../app/queries";
import { formatDateTime } from "../labels";
import { ProgressBar } from "../ui/ProgressBar";
import { useDraft } from "../ui/use-draft";
import { SidePanel } from "../ui/SidePanel";
import { StatusBadge } from "../ui/StatusBadge";
import { TaskBody } from "./TaskBody";
import { TaskFields } from "./TaskFields";
import { TaskOptions, TaskRefs } from "./TaskRefs";
import styles from "./TaskPanel.module.css";

export type TaskPanelProps = {
  task: Task;
  tasks: readonly Task[];
  index: BacklogIndex;
  onClose: () => void;
};

const OPTIONS_ID = "task-ids";

export function TaskPanel({ task, tasks, index, onClose }: TaskPanelProps) {
  const updateTask = useUpdateTask();
  const [title, setTitle, titleRef] = useDraft(task.title);

  const apply = (changes: TaskChangesRequest) => updateTask.mutate({ id: task.id, version: task.version, changes });
  const applyAsync = (changes: TaskChangesRequest) => updateTask.mutateAsync({ id: task.id, version: task.version, changes });
  const conflict = updateTask.error instanceof ApiError && updateTask.error.status === 409;
  const warnings = taskWarnings(task, index);
  const children = task.type === "epic" ? epicChildren(task, index) : [];

  return (
    <SidePanel label={`Задача ${task.id}`} heading={<span className={styles.id}>{task.id}</span>} onClose={onClose}>
      <input
        ref={titleRef}
        className={styles.title}
        value={title}
        aria-label="Название задачи"
        onChange={(event) => setTitle(event.target.value)}
        onBlur={() => title !== task.title && apply({ title })}
      />

      <TaskFields task={task} optionsId={OPTIONS_ID} onChange={apply} />

      <div className={styles.meta}>
        <StatusBadge status={task.status} />
        <ProgressBar progress={taskProgress(task, index)} />
        <span>создана {formatDateTime(task.created)}</span>
        {task.source && <span className={styles.source}>{task.source}</span>}
      </div>

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
        onToggleLine={(line) => apply({ body: toggleChecklistItem(task.body, line) })}
        onSave={(body) => applyAsync({ body })}
      />

      <TaskRefs label="Блокируется" ids={task.blockedBy} tasks={tasks} listId={OPTIONS_ID} onChange={(blockedBy) => apply({ blockedBy })} />
      <TaskRefs label="Связанные" ids={task.related} tasks={tasks} listId={OPTIONS_ID} onChange={(related) => apply({ related })} />

      <ReadonlyRefs label="Блокирует" tasks={dependentTasks(task, index)} />
      <ReadonlyRefs label="Ссылаются как на связанную" tasks={relatedTasks(task, index).filter((other) => !task.related.includes(other.id))} />
      <ReadonlyRefs label="Задачи эпика" tasks={children} />

      <TaskOptions id={OPTIONS_ID} tasks={tasks} />
    </SidePanel>
  );
}

function ReadonlyRefs({ label, tasks }: { label: string; tasks: readonly Task[] }) {
  if (tasks.length === 0) return null;
  return (
    <section className={styles.readonlyRefs} aria-label={label}>
      <h3>{label}</h3>
      <ul>
        {tasks.map((task) => (
          <li key={task.id}>
            <span className={styles.id}>{task.id}</span> {task.title}
          </li>
        ))}
      </ul>
    </section>
  );
}
