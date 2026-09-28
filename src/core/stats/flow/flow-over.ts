import { formatLocalIso } from "../../model/dates";
import { closingsOf, isOpenAt, type TaskHistory } from "../history";
import type { Period } from "../period";
import type { FlowPeriod } from "../types";

export function flowOver(periods: readonly Period[], histories: readonly TaskHistory[]): FlowPeriod[] {
  const closings = histories.flatMap(closingsOf);
  return periods.map((span) => ({
    start: formatLocalIso(new Date(span.from)),
    created: histories.filter((history) => span.contains(history.createdAt)).length,
    closed: closings.filter((closing) => span.contains(closing.at)).length,
    openAtEnd: histories.filter((history) => isOpenAt(history, span.to)).length,
  }));
}
