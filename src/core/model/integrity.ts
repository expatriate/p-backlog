import { missingReferences, type BacklogIndex } from "./graph";
import { RESOLUTION_STATUS } from "./lifecycle";
import type { Problem } from "./problems";
import type { NotLoadedTasks, Task, UnparsedFile } from "./types";

const NOTHING_NOT_LOADED: NotLoadedTasks = new Map();

export function integrityErrors(candidate: Task, index: BacklogIndex, notLoadedTasks: NotLoadedTasks = NOTHING_NOT_LOADED): Problem[] {
  const resolve = (id: string): Task | undefined => (id === candidate.id ? candidate : index.byId.get(id));
  const errors: Problem[] = [];

  if (candidate.blockedBy.includes(candidate.id)) errors.push({ code: "self-block" });
  if (candidate.related.includes(candidate.id)) errors.push({ code: "self-related" });

  errors.push(...epicProblems(candidate, resolve, notLoadedTasks));

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

export function epicProblems(candidate: Pick<Task, "id" | "type" | "epic" | "projectId">, resolve: (id: string) => Task | undefined, notLoadedTasks: NotLoadedTasks): Problem[] {
  if (candidate.epic === undefined) return [];
  const problems: Problem[] = [];
  if (candidate.epic === candidate.id) {
    problems.push({ code: "epic-self" });
  } else {
    const epic = resolve(candidate.epic);
    if (!epic) problems.push(missingEpicProblem(candidate.epic, notLoadedTasks.get(candidate.epic)));
    else if (epic.type !== "epic") problems.push({ code: "epic-not-epic", epic: candidate.epic });
    else if (epic.projectId !== candidate.projectId) problems.push({ code: "epic-foreign-project", epic: candidate.epic });
  }
  if (candidate.type === "epic") problems.push({ code: "epic-in-epic" });
  return problems;
}

function missingEpicProblem(epic: string, file: UnparsedFile | undefined): Problem {
  return file === undefined ? { code: "epic-missing", epic } : { code: "epic-unparsed", epic, fileKind: file };
}

export function taskWarnings(task: Task, index: BacklogIndex, notLoadedTasks: NotLoadedTasks): Problem[] {
  const missing = missingReferences(task, index).map((id) => missingReferenceProblem(id, notLoadedTasks.get(id)));
  return [...missing, ...integrityErrors(task, index, notLoadedTasks)];
}

function missingReferenceProblem(id: string, file: UnparsedFile | undefined): Problem {
  return file === undefined ? { code: "reference-missing", id } : { code: "reference-unparsed", id, fileKind: file };
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
