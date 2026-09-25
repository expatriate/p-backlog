import { compareIds } from "../../core/model/ids";
import { countBy } from "../../core/stats/numbers";
import type { Task } from "../../core/model/types";
import { toneOf, type EpicTones } from "../ui/epic-tone";

export type EpicChoice = { id: string; title: string; tone: number | undefined; taskCount: number };
export type EpicChoices = { epics: EpicChoice[]; withoutEpicCount: number };

export function epicChoices(tasks: readonly Task[], tones: EpicTones): EpicChoices {
  const childCounts = countBy(tasks.flatMap((task) => task.epic ?? []), (epic) => epic);
  const epics = tasks
    .filter((task) => task.type === "epic")
    .sort((a, b) => compareIds(a.id, b.id))
    .map((epic) => ({
      id: epic.id,
      title: epic.title,
      tone: toneOf(epic, tones),
      taskCount: childCounts.get(epic.id) ?? 0,
    }));
  return { epics, withoutEpicCount: tasks.filter((task) => task.epic === undefined).length };
}
