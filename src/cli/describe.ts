import { dependentTasks, epicChildren, openBlockers, relatedTasks, taskProgress, type BacklogIndex } from "../core/model/graph";
import { taskWarnings } from "../core/model/integrity";
import { formatLocalIso } from "../core/model/dates";
import { scheduledDeletion, type ScheduledDeletion } from "../core/model/lifecycle";
import type { Problem } from "../core/model/problems";
import type { Task } from "../core/model/types";

export type EpicReference = { kind: "loaded"; task: Task } | { kind: "not-loaded" | "missing"; id: string };

export type TaskDescription = {
  task: Task;
  progress: number | null;
  openBlockers: Task[];
  inactiveBlockerIds: string[];
  blocks: readonly Task[];
  related: Task[];
  epic: EpicReference | undefined;
  children: readonly Task[];
  warnings: Problem[];
  deletion: ScheduledDeletion | undefined;
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
    epic: task.epic === undefined ? undefined : epicReference(task.epic, index),
    children: task.type === "epic" ? epicChildren(task, index) : [],
    warnings: taskWarnings(task, index),
    deletion: scheduledDeletion(task, index),
  };
}

function epicReference(id: string, index: BacklogIndex): EpicReference {
  const task = index.byId.get(id);
  if (task !== undefined) return { kind: "loaded", task };
  return { kind: index.notLoaded.has(id) ? "not-loaded" : "missing", id };
}

function descriptionJson(description: TaskDescription): object {
  const reference = (task: Task) => ({ id: task.id, title: task.title, status: task.status });
  return {
    ...description.task,
    progress: description.progress,
    blocked: description.openBlockers.length > 0,
    openBlockers: description.openBlockers.map(reference),
    blocks: description.blocks.map(reference),
    relatedTasks: description.related.map(reference),
    epicTask: description.epic?.kind === "loaded" ? reference(description.epic.task) : undefined,
    children: description.children.map(reference),
    warnings: description.warnings,
    ...deletionJson(description.deletion),
  };
}

function deletionJson(deletion: ScheduledDeletion | undefined): object {
  if (deletion === undefined) return {};
  return "at" in deletion ? { deletesAt: formatLocalIso(deletion.at) } : { deletesAfterEpic: deletion.afterEpic };
}

export function taskJson(task: Task, index: BacklogIndex): object {
  return descriptionJson(describeTask(task, index));
}

export function tasksJson(tasks: readonly Task[], index: BacklogIndex): object[] {
  return tasks.map((task) => taskJson(task, index));
}
