import { compareIds } from "../../core/model/ids";
import type { Task } from "../../core/model/types";
import { EPIC_TONES, type EpicTone } from "../ui/epic-tone";

export type EpicTones = ReadonlyMap<string, EpicTone>;

export function epicTones(tasks: readonly Task[]): EpicTones {
  const epics = tasks.filter((task) => task.type === "epic").sort((a, b) => compareIds(a.id, b.id));
  const tones = new Map<string, EpicTone>();
  const assignedInProject = new Map<string, number>();
  for (const epic of epics) {
    const assigned = assignedInProject.get(epic.projectId) ?? 0;
    tones.set(epic.id, toneAt(assigned));
    assignedInProject.set(epic.projectId, assigned + 1);
  }
  return tones;
}

export function toneOf(task: Task, tones: EpicTones): EpicTone | undefined {
  const epicId = task.type === "epic" ? task.id : task.epic;
  return epicId === undefined ? undefined : tones.get(epicId);
}

function toneAt(ordinal: number): EpicTone {
  return EPIC_TONES[ordinal % EPIC_TONES.length] ?? EPIC_TONES[0];
}
