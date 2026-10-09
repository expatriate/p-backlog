import { formatLocalIso } from "../../model/dates";
import { closingsIn, createdIn, isOpenAt, type TaskHistory } from "../history";
import type { Period } from "../period";
import type { FlowPeriod } from "../types";

export function flowOver(periods: readonly Period[], histories: readonly TaskHistory[]): FlowPeriod[] {
  return periods.map((period) => ({
    start: formatLocalIso(new Date(period.from)),
    created: createdIn(histories, period).length,
    closed: closingsIn(histories, period).length,
    openAtEnd: histories.filter((history) => isOpenAt(history, period.to)).length,
  }));
}
