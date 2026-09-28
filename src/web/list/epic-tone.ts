import { compareIds } from "../../core/model/ids";
import type { Task } from "../../core/model/types";

const EPIC_TONE_COUNT = 5;

export type EpicTones = ReadonlyMap<string, number>;

export function epicTones(tasks: readonly Task[]): EpicTones {
  const epics = tasks.filter((task) => task.type === "epic").sort((a, b) => compareIds(a.id, b.id));
  const tones = new Map<string, number>();
  const assignedInProject = new Map<string, number>();
  for (const epic of epics) {
    const assigned = assignedInProject.get(epic.projectId) ?? 0;
    tones.set(epic.id, (assigned % EPIC_TONE_COUNT) + 1);
    assignedInProject.set(epic.projectId, assigned + 1);
  }
  return tones;
}

export function toneOf(task: Task, tones: EpicTones): number | undefined {
  const epicId = task.type === "epic" ? task.id : task.epic;
  return epicId === undefined ? undefined : tones.get(epicId);
}
