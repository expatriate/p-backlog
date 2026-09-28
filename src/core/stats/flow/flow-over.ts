import { formatLocalIso } from "../../model/dates";
import { closingsIn, createdIn, isOpenAt, type TaskHistory } from "../history";
import type { Period } from "../period";
import type { FlowPeriod } from "../types";

export function flowOver(periods: readonly Period[], histories: readonly TaskHistory[]): FlowPeriod[] {
  return periods.map((span) => ({
    start: formatLocalIso(new Date(span.from)),
    created: createdIn(histories, span).length,
    closed: closingsIn(histories, span).length,
    openAtEnd: histories.filter((history) => isOpenAt(history, span.to)).length,
  }));
}
