import type { SortKey } from "../core/model/query";
import type { Priority, TaskStatus, TaskType } from "../core/model/types";

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

export const SORT_LABELS: Record<SortKey, string> = {
  created: "дате создания",
  priority: "приоритету",
  progress: "прогрессу",
  title: "названию",
  status: "статусу",
};

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatProgress(progress: number | null): string {
  return progress === null ? "—" : `${progress}%`;
}
