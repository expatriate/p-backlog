import { missingReferences, type BacklogIndex } from "./graph";
import type { Task } from "./types";

export function integrityErrors(candidate: Task, index: BacklogIndex): string[] {
  const resolve = (id: string): Task | undefined => (id === candidate.id ? candidate : index.byId.get(id));
  const errors: string[] = [];

  if (candidate.blockedBy.includes(candidate.id)) errors.push("задача не может блокировать саму себя");
  if (candidate.related.includes(candidate.id)) errors.push("задача не может быть связана сама с собой");

  if (candidate.epic === candidate.id) {
    errors.push("задача не может быть своим эпиком");
  } else if (candidate.epic !== undefined) {
    const epic = resolve(candidate.epic);
    if (!epic) errors.push(`эпик ${candidate.epic} не найден`);
    else if (epic.type !== "epic") errors.push(`${candidate.epic} не является эпиком`);
  }

  if (candidate.type === "epic" && candidate.epic !== undefined) errors.push("эпик не может входить в другой эпик");

  const children = (index.childrenOf.get(candidate.id) ?? []).filter((task) => task.id !== candidate.id);
  if (candidate.type === "task" && children.length > 0) {
    errors.push(`на задачу ссылаются как на эпик: ${children.map((task) => task.id).join(", ")}`);
  }

  const cycle = findBlockerCycle(candidate, resolve);
  if (cycle) errors.push(`цикл блокеров: ${cycle.join(" → ")}`);

  return errors;
}

export function taskWarnings(task: Task, index: BacklogIndex): string[] {
  const missing = missingReferences(task, index).map((id) => `${id} не найдена`);
  return [...missing, ...integrityErrors(task, index)];
}

function findBlockerCycle(start: Task, resolve: (id: string) => Task | undefined): string[] | null {
  const visited = new Set<string>();
  const walk = (task: Task, path: string[]): string[] | null => {
    for (const blockerId of task.blockedBy) {
      if (blockerId === start.id) return [...path, blockerId];
      if (visited.has(blockerId)) continue;
      visited.add(blockerId);
      const blocker = resolve(blockerId);
      const cycle = blocker ? walk(blocker, [...path, blockerId]) : null;
      if (cycle) return cycle;
    }
    return null;
  };
  const withoutSelfBlock = { ...start, blockedBy: start.blockedBy.filter((id) => id !== start.id) };
  return walk(withoutSelfBlock, [start.id]);
}
