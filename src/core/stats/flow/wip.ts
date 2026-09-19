import { formatLocalIso } from "../../model/dates";
import type { TaskHistory } from "../history";
import type { FlowWip } from "../types";
import { STATS_WEEKS, weekStarts } from "../weeks";
import { statusAt } from "./status-at";

export function flowWip(histories: readonly TaskHistory[], now: Date, journalStart: number | null): FlowWip {
  const nowMs = now.getTime();
  const starts = weekStarts(now, STATS_WEEKS);
  const inProgressAt = (moment: number) => histories.filter((history) => history.createdAt <= moment && statusAt(history, moment) === "in-progress").length;
  const moments = histories.flatMap((history) => history.transitions.map((transition) => transition.at));
  const weeks = starts.map((start, index) => {
    const end = starts[index + 1]?.getTime() ?? nowMs + 1;
    if (journalStart === null || end <= journalStart) return { start: formatLocalIso(start), max: null };
    const from = Math.max(start.getTime(), journalStart);
    const checks = [from, ...moments.filter((moment) => moment >= from && moment < end)];
    return { start: formatLocalIso(start), max: checks.reduce((max, moment) => Math.max(max, inProgressAt(moment)), 0) };
  });
  return { weeks, current: inProgressAt(nowMs) };
}
