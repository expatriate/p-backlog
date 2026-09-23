import type { SortDirection } from "../core/model/query";
import type { TaskType } from "../core/model/types";

export const TYPE_LABELS: Record<TaskType, string> = { task: "задача", epic: "эпик" };

export const DIRECTION_MARKS: Record<SortDirection, string> = { asc: "↑", desc: "↓" };

export function formatProgress(progress: number | null): string {
  return progress === null ? "—" : `${progress}%`;
}
