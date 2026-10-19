import { isBlocked } from "../../core/model/graph";
import type { Task } from "../../core/model/types";
import { useAllTasks } from "../app/all-tasks";
import { useMessages } from "../i18n";

export function BlockedMarker({ task, className }: { task: Task; className: string | undefined }) {
  const { list } = useMessages();
  const { index } = useAllTasks();
  if (task.status === "blocked" || !isBlocked(task, index)) return null;
  return (
    <span className={className} title={list.blockedTitle}>
      {list.blockedBadge}
    </span>
  );
}
