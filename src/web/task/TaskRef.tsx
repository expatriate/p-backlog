import { Link } from "react-router";
import { useAllTasks } from "../app/all-tasks";
import { useTaskHref } from "../app/use-task-href";
import { useMessages } from "../i18n";
import { cx } from "../ui/cx";
import { StatusBadge } from "../ui/StatusBadge";
import { TaskId } from "../ui/TaskId";
import styles from "./TaskRef.module.css";

export function TaskRef({ id, muted = false }: { id: string; muted?: boolean }) {
  const { task: taskMessages } = useMessages();
  const { index } = useAllTasks();
  const taskHref = useTaskHref();
  const task = index.byId.get(id);
  return (
    <>
      <TaskId id={id} />{" "}
      {task ? (
        <Link to={taskHref(id)} className={cx(styles.title, muted && styles.muted)}>
          {task.title}
        </Link>
      ) : (
        <span className={styles.title}>{taskMessages.refNotFound}</span>
      )}{" "}
      {task && <StatusBadge status={task.status} />}
    </>
  );
}
