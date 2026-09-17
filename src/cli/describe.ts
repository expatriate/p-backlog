import { dependentTasks, epicChildren, openBlockers, relatedTasks, taskProgress, type BacklogIndex } from "../core/model/graph";
import { taskWarnings } from "../core/model/integrity";
import type { Task } from "../core/model/types";

export type TaskDescription = {
  task: Task;
  progress: number | null;
  openBlockers: Task[];
  inactiveBlockerIds: string[];
  blocks: readonly Task[];
  related: Task[];
  epic: Task | undefined;
  children: readonly Task[];
  warnings: string[];
};

export function describeTask(task: Task, index: BacklogIndex): TaskDescription {
  const open = openBlockers(task, index);
  return {
    task,
    progress: taskProgress(task, index),
    openBlockers: open,
    inactiveBlockerIds: task.blockedBy.filter((id) => !open.some((blocker) => blocker.id === id)),
    blocks: dependentTasks(task, index),
    related: relatedTasks(task, index),
    epic: task.epic === undefined ? undefined : index.byId.get(task.epic),
    children: task.type === "epic" ? epicChildren(task, index) : [],
    warnings: taskWarnings(task, index),
  };
}

export function toJson(description: TaskDescription): object {
  const reference = (task: Task) => ({ id: task.id, title: task.title, status: task.status });
  return {
    ...description.task,
    progress: description.progress,
    blocked: description.openBlockers.length > 0,
    openBlockers: description.openBlockers.map(reference),
    blocks: description.blocks.map(reference),
    relatedTasks: description.related.map(reference),
    epicTask: description.epic && reference(description.epic),
    children: description.children.map(reference),
    warnings: description.warnings,
  };
}
