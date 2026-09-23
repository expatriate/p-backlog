import { compareIds } from "../../core/model/ids";
import type { Task } from "../../core/model/types";
import { toneOf, type EpicTones } from "../ui/epic-tone";

type EpicChoice = { id: string; title: string; tone: number | undefined; taskCount: number };
export type EpicChoices = { epics: EpicChoice[]; withoutEpicCount: number };

export function epicChoices(tasks: readonly Task[], tones: EpicTones): EpicChoices {
  const epics = tasks
    .filter((task) => task.type === "epic")
    .sort((a, b) => compareIds(a.id, b.id))
    .map((epic) => ({
      id: epic.id,
      title: epic.title,
      tone: toneOf(epic, tones),
      taskCount: tasks.filter((task) => task.epic === epic.id).length,
    }));
  return { epics, withoutEpicCount: tasks.filter((task) => task.epic === undefined).length };
}
