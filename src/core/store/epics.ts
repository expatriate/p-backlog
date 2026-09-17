import type { Priority, Project, Task } from "../model/types";
import { createTask } from "./create";
import { loadBacklog } from "./load";
import { updateTaskIn } from "./update";
import { invalid, type Invalid, type UpdateTaskResult } from "./write-result";

export type CreateEpicRequest = {
  project: Project;
  title: string;
  body?: string;
  priority?: Priority;
  tags?: string[];
  taskIds: string[];
  now: Date;
};

export type PartialEpic = { ok: false; reason: "partial"; epic: Task; attached: Task[]; failedId: string; errors: string[] };

export type CreateEpicResult = { ok: true; epic: Task; tasks: Task[] } | Invalid | PartialEpic;

export async function createEpic(root: string, request: CreateEpicRequest): Promise<CreateEpicResult> {
  const { tasks } = await loadBacklog(root);
  let snapshot: readonly Task[] = tasks;
  const taskIds = [...new Set(request.taskIds)];
  const errors = membershipErrors(taskIds, request.project, tasks);
  if (errors.length > 0) return invalid(errors);

  const created = await createTask(root, {
    project: request.project,
    input: { title: request.title, body: request.body, priority: request.priority, tags: request.tags, type: "epic" },
    existingTasks: tasks,
    now: request.now,
  });
  if (!created.ok) return created;
  snapshot = [...snapshot, created.task];

  const attached: Task[] = [];
  for (const id of taskIds) {
    const result = await updateTaskIn(snapshot, { id, changes: { epic: created.task.id } });
    if (!result.ok) {
      return { ok: false, reason: "partial", epic: created.task, attached, failedId: id, errors: [`${id}: ${describeFailure(result)}`] };
    }
    snapshot = snapshot.map((task) => (task.id === id ? result.task : task));
    attached.push(result.task);
  }
  return { ok: true, epic: created.task, tasks: attached };
}

function membershipErrors(taskIds: readonly string[], project: Project, tasks: readonly Task[]): string[] {
  if (taskIds.length === 0) return ["выберите хотя бы одну задачу"];
  return taskIds.flatMap((id) => {
    const task = tasks.find((candidate) => candidate.id === id);
    if (!task) return [`${id} не найдена`];
    if (task.projectId !== project.id) return [`${id} из другого проекта`];
    if (task.type === "epic") return [`${id} — эпик, эпики не вкладываются`];
    return [];
  });
}

function describeFailure(result: Exclude<UpdateTaskResult, { ok: true }>): string {
  switch (result.reason) {
    case "not-found":
      return "не найдена";
    case "conflict":
      return "изменилась во время записи";
    case "invalid":
      return result.errors.join("; ");
  }
}
