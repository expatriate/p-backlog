import { formatLocalIso } from "../../model/dates";
import type { TaskHistory } from "../history";
import type { WipWeek } from "../types";
import { STATS_WEEKS, weekStarts } from "../weeks";
import { statusAt } from "./status-at";

type Step = { at: number; delta: number };

export function flowWip(histories: readonly TaskHistory[], now: Date, journalStart: number | null): WipWeek[] {
  const nowMs = now.getTime();
  const starts = weekStarts(now, STATS_WEEKS);
  const steps = inProgressSteps(histories);
  let index = 0;
  let inProgress = journalStart === null ? 0 : inProgressAt(histories, journalStart);
  while (journalStart !== null && index < steps.length && (steps[index]?.at ?? 0) <= journalStart) index++;

  return starts.map((start, position) => {
    const end = starts[position + 1]?.getTime() ?? nowMs + 1;
    if (journalStart === null || end <= journalStart) return { start: formatLocalIso(start), max: null };
    let max = inProgress;
    while (index < steps.length && (steps[index]?.at ?? 0) < end) {
      const moment = steps[index]?.at;
      while (index < steps.length && steps[index]?.at === moment) {
        inProgress += steps[index]?.delta ?? 0;
        index++;
      }
      max = Math.max(max, inProgress);
    }
    return { start: formatLocalIso(start), max };
  });
}

function inProgressSteps(histories: readonly TaskHistory[]): Step[] {
  const steps = histories.flatMap((history) => {
    let inProgress = false;
    return history.transitions.flatMap((transition): Step[] => {
      const nowInProgress = transition.to === "in-progress";
      if (nowInProgress === inProgress) return [];
      inProgress = nowInProgress;
      return [{ at: transition.at, delta: nowInProgress ? 1 : -1 }];
    });
  });
  return steps.sort((a, b) => a.at - b.at);
}

function inProgressAt(histories: readonly TaskHistory[], moment: number): number {
  return histories.filter((history) => history.createdAt <= moment && statusAt(history, moment) === "in-progress").length;
}
