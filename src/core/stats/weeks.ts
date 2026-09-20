import { formatLocalIso } from "../model/dates";
import { closingsOf, isOpenAt, type TaskHistory } from "./history";
import type { WeekFlow } from "./types";

export const STATS_WEEKS = 12;

export function weekStarts(now: Date, count: number): Date[] {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  return Array.from({ length: count }, (_, index) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7 * (count - 1 - index)));
}

export function periodStart(now: Date): number {
  return weekStarts(now, STATS_WEEKS)[0]?.getTime() ?? now.getTime();
}

export function weekWindows(now: Date, count = STATS_WEEKS): { start: Date; inWeek: (moment: number) => boolean }[] {
  const starts = weekStarts(now, count);
  return starts.map((start, index) => {
    const end = starts[index + 1]?.getTime() ?? now.getTime() + 1;
    return { start, inWeek: (moment: number) => moment >= start.getTime() && moment < end };
  });
}

export function weeklyFlow(histories: readonly TaskHistory[], now: Date): WeekFlow[] {
  const closings = histories.flatMap(closingsOf);
  return weekWindows(now).map(({ start, inWeek }, index, windows) => {
    const end = windows[index + 1]?.start.getTime() ?? now.getTime() + 1;
    return {
      start: formatLocalIso(start),
      created: histories.filter((history) => inWeek(history.createdAt)).length,
      closed: closings.filter((closing) => inWeek(closing.at)).length,
      openAtEnd: histories.filter((history) => isOpenAt(history, end - 1)).length,
    };
  });
}
