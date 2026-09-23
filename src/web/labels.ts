import type { SortDirection } from "../core/model/query";

export const DIRECTION_MARKS: Record<SortDirection, string> = { asc: "↑", desc: "↓" };

export function formatProgress(progress: number | null): string {
  return progress === null ? "—" : `${progress}%`;
}
