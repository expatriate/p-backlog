import { isClosed } from "../model/graph";
import { parseId } from "../model/ids";
import { isExpired } from "../model/lifecycle";
import { serializeProject } from "../model/project-file";
import type { Project, Task } from "../model/types";
import { removeIfUnchanged, writeFileAtomic } from "./fs-utils";
import { loadBacklog } from "./load";
import { referenceCleanup } from "./references";
import { updateTaskIn } from "./update";
import type { UpdateTaskFailure } from "./write-result";

export type SweepReport = { deleted: string[]; conflicts: string[]; invalid: { id: string; errors: string[] }[] };

export async function sweepClosed(root: string, now: Date): Promise<SweepReport> {
  const { projects, tasks } = await loadBacklog(root);
  const expired = tasks.filter((task) => isExpired(task, now));
  const expiredIds = new Set(expired.map((task) => task.id));
  await reserveNumbers(projects, expired);

  const report: SweepReport = { deleted: [], conflicts: [], invalid: [] };
  for (const task of tasks.filter((candidate) => !expiredIds.has(candidate.id))) {
    const cleanup = referenceCleanup(task, (id) => expiredIds.has(id));
    if (cleanup === null && !lacksClosedDate(task)) continue;
    const result = await updateTaskIn(tasks, { id: task.id, changes: cleanup ?? {}, expectedVersion: task.version, now });
    if (!result.ok) recordFailure(report, task.id, result);
  }

  for (const task of expired) {
    if (await removeIfUnchanged(task.path, task.version)) report.deleted.push(task.id);
    else report.conflicts.push(task.id);
  }
  return report;
}

function recordFailure(report: SweepReport, id: string, failure: UpdateTaskFailure): void {
  switch (failure.reason) {
    case "invalid":
      report.invalid.push({ id, errors: failure.errors });
      return;
    case "conflict":
    case "not-found":
      report.conflicts.push(id);
      return;
  }
}

function lacksClosedDate(task: Task): boolean {
  return isClosed(task.status) && task.closed === undefined;
}

async function reserveNumbers(projects: readonly Project[], expired: readonly Task[]): Promise<void> {
  for (const project of projects) {
    const numbers = expired.filter((task) => task.projectId === project.id).flatMap((task) => parseId(task.id)?.number ?? []);
    if (numbers.length === 0) continue;
    const issuedUpTo = Math.max(project.issuedUpTo ?? 0, ...numbers);
    if (issuedUpTo !== project.issuedUpTo) await writeFileAtomic(project.path, serializeProject({ ...project, issuedUpTo }));
  }
}
