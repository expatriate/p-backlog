import { missingReferences, type BacklogIndex } from "./graph";
import { RESOLUTION_STATUS } from "./lifecycle";
import type { Task } from "./types";

export function integrityErrors(candidate: Task, index: BacklogIndex): string[] {
  const resolve = (id: string): Task | undefined => (id === candidate.id ? candidate : index.byId.get(id));
  const errors: string[] = [];

  if (candidate.blockedBy.includes(candidate.id)) errors.push("задача не может блокировать саму себя");
  if (candidate.related.includes(candidate.id)) errors.push("задача не может быть связана сама с собой");

  errors.push(...epicProblems(candidate, resolve));

  const children = (index.childrenOf.get(candidate.id) ?? []).filter((task) => task.id !== candidate.id);
  if (candidate.type === "task" && children.length > 0) {
    errors.push(`на задачу ссылаются как на эпик: ${children.map((task) => task.id).join(", ")}`);
  }

  const cycle = findBlockerCycle(candidate, resolve);
  if (cycle) errors.push(`цикл блокеров: ${cycle.join(" → ")}`);

  if (candidate.resolution !== undefined && candidate.status !== RESOLUTION_STATUS[candidate.resolution]) {
    errors.push(`resolution ${candidate.resolution} требует статус ${RESOLUTION_STATUS[candidate.resolution]}`);
  }
  if (candidate.reason !== undefined && candidate.resolution === undefined) errors.push("reason задаётся только вместе с resolution");

  return errors;
}

export function epicProblems(candidate: Pick<Task, "id" | "type" | "epic">, resolve: (id: string) => Task | undefined): string[] {
  if (candidate.epic === undefined) return [];
  const problems: string[] = [];
  if (candidate.epic === candidate.id) {
    problems.push("задача не может быть своим эпиком");
  } else {
    const epic = resolve(candidate.epic);
    if (!epic) problems.push(`эпик ${candidate.epic} не найден`);
    else if (epic.type !== "epic") problems.push(`${candidate.epic} не является эпиком`);
  }
  if (candidate.type === "epic") problems.push("эпик не может входить в другой эпик");
  return problems;
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
