import type { SortDirection } from "../core/model/query";

export const NO_VALUE = "—";

export const DIRECTION_MARKS: Record<SortDirection, string> = { asc: "↑", desc: "↓" };

export function formatProgress(progress: number | null): string {
  return progress === null ? NO_VALUE : `${progress}%`;
}
