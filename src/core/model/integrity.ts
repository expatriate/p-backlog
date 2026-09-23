import { missingReferences, type BacklogIndex } from "./graph";
import { RESOLUTION_STATUS } from "./lifecycle";
import type { Problem } from "./problems";
import type { Task } from "./types";

export function integrityErrors(candidate: Task, index: BacklogIndex): Problem[] {
  const resolve = (id: string): Task | undefined => (id === candidate.id ? candidate : index.byId.get(id));
  const errors: Problem[] = [];

  if (candidate.blockedBy.includes(candidate.id)) errors.push({ code: "self-block" });
  if (candidate.related.includes(candidate.id)) errors.push({ code: "self-related" });

  errors.push(...epicProblems(candidate, resolve));

  const children = (index.childrenOf.get(candidate.id) ?? []).filter((task) => task.id !== candidate.id);
  if (candidate.type === "task" && children.length > 0) {
    errors.push({ code: "referenced-as-epic", children: children.map((task) => task.id) });
  }

  const cycle = findBlockerCycle(candidate, resolve);
  if (cycle) errors.push({ code: "blocker-cycle", cycle });

  if (candidate.resolution !== undefined && candidate.status !== RESOLUTION_STATUS[candidate.resolution]) {
    errors.push({ code: "resolution-needs-status", resolution: candidate.resolution, status: RESOLUTION_STATUS[candidate.resolution] });
  }
  if (candidate.reason !== undefined && candidate.resolution === undefined) errors.push({ code: "reason-without-resolution" });

  return errors;
}

export function epicProblems(candidate: Pick<Task, "id" | "type" | "epic">, resolve: (id: string) => Task | undefined): Problem[] {
  if (candidate.epic === undefined) return [];
  const problems: Problem[] = [];
  if (candidate.epic === candidate.id) {
    problems.push({ code: "epic-self" });
  } else {
    const epic = resolve(candidate.epic);
    if (!epic) problems.push({ code: "epic-missing", epic: candidate.epic });
    else if (epic.type !== "epic") problems.push({ code: "epic-not-epic", epic: candidate.epic });
  }
  if (candidate.type === "epic") problems.push({ code: "epic-in-epic" });
  return problems;
}

export function taskWarnings(task: Task, index: BacklogIndex): Problem[] {
  const missing = missingReferences(task, index).map((id): Problem => ({ code: "reference-missing", id }));
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
