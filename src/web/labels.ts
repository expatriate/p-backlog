import type { SortDirection } from "../core/model/query";
import type { Priority, Resolution, TaskStatus, TaskType } from "../core/model/types";

export const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "в беклоге",
  "in-progress": "в работе",
  blocked: "заблокирована",
  done: "сделана",
  cancelled: "отменена",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "низкий",
  medium: "средний",
  high: "высокий",
  critical: "критичный",
};

export const TYPE_LABELS: Record<TaskType, string> = { task: "задача", epic: "эпик" };

export const RESOLUTION_LABELS: Record<Resolution, string> = {
  fixed: "исправлено",
  obsolete: "кода нет",
  duplicate: "дубль",
  "epic-done": "эпик завершён",
};

export const DIRECTION_MARKS: Record<SortDirection, string> = { asc: "↑", desc: "↓" };

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function formatDayMonth(date: Date): string {
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatProgress(progress: number | null): string {
  return progress === null ? "—" : `${progress}%`;
}
