import { isClosed } from "../../model/graph";
import { compareIds } from "../../model/ids";
import type { Task } from "../../model/types";
import { closingsOf, emptyHistory, type TaskHistory } from "../history";
import type { EpicFlow } from "../types";
import { FORECAST_WINDOW_WEEKS, inForecastWindow } from "./forecast";

const EPIC_LIMIT = 8;

export function flowEpics(tasks: readonly Task[], histories: readonly TaskHistory[], now: Date): EpicFlow[] {
  const inWindow = inForecastWindow(now);
  const historyById = new Map(histories.map((history) => [history.id, history]));
  return tasks
    .filter((task) => task.type === "epic" && !isClosed(task.status))
    .map((epic) => {
      const children = tasks.filter((task) => task.epic === epic.id);
      const closed = children.filter((task) => isClosed(task.status)).length;
      const open = children.length - closed;
      const recentClosings = children.flatMap((task) => closingsOf(historyById.get(task.id) ?? NO_HISTORY)).filter((closing) => inWindow(closing.at)).length;
      const flow: EpicFlow = { id: epic.id, projectId: epic.projectId, title: epic.title, closed, total: children.length, weeks: epicWeeks(children.length, open, recentClosings / FORECAST_WINDOW_WEEKS) };
      return { flow, open };
    })
    .sort((a, b) => b.open - a.open || compareIds(a.flow.id, b.flow.id))
    .slice(0, EPIC_LIMIT)
    .map(({ flow }) => flow);
}

const NO_HISTORY = emptyHistory();

function epicWeeks(total: number, open: number, weeklyRate: number): number | null {
  if (total === 0) return null;
  if (open === 0) return 0;
  return weeklyRate > 0 ? Math.ceil(open / weeklyRate) : null;
}
