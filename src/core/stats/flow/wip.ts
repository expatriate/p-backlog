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
  if (journalStart === null) return starts.map((start) => ({ start: formatLocalIso(start), max: null }));

  const pending = steps.filter((step) => step.at > journalStart);
  let inProgress = inProgressAt(histories, journalStart);
  const weeks: WipWeek[] = [];
  for (const [position, start] of starts.entries()) {
    const end = starts[position + 1]?.getTime() ?? nowMs + 1;
    if (end <= journalStart) {
      weeks.push({ start: formatLocalIso(start), max: null });
      continue;
    }
    let max = inProgress;
    while (pending.length > 0 && (pending[0]?.at ?? end) < end) {
      const moment = pending[0]?.at;
      while (pending.length > 0 && pending[0]?.at === moment) inProgress += pending.shift()?.delta ?? 0;
      max = Math.max(max, inProgress);
    }
    weeks.push({ start: formatLocalIso(start), max });
  }
  return weeks;
}

function inProgressSteps(histories: readonly TaskHistory[]): Step[] {
  const steps = histories.flatMap((history) => {
    let inProgress = history.transitions[0]?.from === "in-progress";
    const opening: Step[] = inProgress ? [{ at: history.createdAt, delta: 1 }] : [];
    return opening.concat(history.transitions.flatMap((transition): Step[] => {
      const nowInProgress = transition.to === "in-progress";
      if (nowInProgress === inProgress) return [];
      inProgress = nowInProgress;
      return [{ at: transition.at, delta: nowInProgress ? 1 : -1 }];
    }));
  });
  return steps.sort((a, b) => a.at - b.at);
}

function inProgressAt(histories: readonly TaskHistory[], moment: number): number {
  return histories.filter((history) => history.createdAt <= moment && statusAt(history, moment) === "in-progress").length;
}
