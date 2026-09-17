import { buildIndex, missingReferences } from "./graph";
import type { Task } from "./types";

export function integrityErrors(candidate: Task, tasks: readonly Task[]): string[] {
  const others = tasks.filter((task) => task.id !== candidate.id);
  const byId = new Map([...others, candidate].map((task) => [task.id, task]));
  const errors: string[] = [];

  if (candidate.blockedBy.includes(candidate.id)) errors.push("задача не может блокировать саму себя");
  if (candidate.related.includes(candidate.id)) errors.push("задача не может быть связана сама с собой");

  if (candidate.epic === candidate.id) {
    errors.push("задача не может быть своим эпиком");
  } else if (candidate.epic !== undefined) {
    const epic = byId.get(candidate.epic);
    if (!epic) errors.push(`эпик ${candidate.epic} не найден`);
    else if (epic.type !== "epic") errors.push(`${candidate.epic} не является эпиком`);
  }

  if (candidate.type === "epic" && candidate.epic !== undefined) errors.push("эпик не может входить в другой эпик");

  const children = others.filter((task) => task.epic === candidate.id);
  if (candidate.type === "task" && children.length > 0) {
    errors.push(`на задачу ссылаются как на эпик: ${children.map((task) => task.id).join(", ")}`);
  }

  const cycle = findBlockerCycle(candidate, byId);
  if (cycle) errors.push(`цикл блокеров: ${cycle.join(" → ")}`);

  return errors;
}

export function taskWarnings(task: Task, tasks: readonly Task[]): string[] {
  const missing = missingReferences(task, buildIndex(tasks)).map((id) => `${id} не найдена`);
  return [...missing, ...integrityErrors(task, tasks)];
}

function findBlockerCycle(start: Task, byId: ReadonlyMap<string, Task>): string[] | null {
  const visited = new Set<string>();
  const walk = (task: Task, path: string[]): string[] | null => {
    for (const blockerId of task.blockedBy) {
      if (blockerId === start.id) return [...path, blockerId];
      if (visited.has(blockerId)) continue;
      visited.add(blockerId);
      const blocker = byId.get(blockerId);
      const cycle = blocker ? walk(blocker, [...path, blockerId]) : null;
      if (cycle) return cycle;
    }
    return null;
  };
  const withoutSelfBlock = { ...start, blockedBy: start.blockedBy.filter((id) => id !== start.id) };
  return walk(withoutSelfBlock, [start.id]);
}
