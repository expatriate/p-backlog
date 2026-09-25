import { useState } from "react";
import type { Task } from "../../core/model/types";

export function useSelectedTask(tasks: readonly Task[], taskId: string | undefined, loaded: boolean) {
  const liveTask = taskId === undefined ? undefined : tasks.find((task) => task.id === taskId);
  const selectedTask = useLastFound(liveTask, taskId);
  return {
    selectedTask,
    gone: liveTask === undefined,
    missingTaskId: taskId !== undefined && loaded && selectedTask === undefined ? taskId : undefined,
  };
}

function useLastFound(task: Task | undefined, taskId: string | undefined): Task | undefined {
  const [lastFound, setLastFound] = useState(task);
  if (task !== undefined && task !== lastFound) setLastFound(task);
  return task ?? (lastFound?.id === taskId ? lastFound : undefined);
}
