import { CATEGORY_LABELS } from "../core/model/categories";
import { formatLocalIso } from "../core/model/dates";
import { isBlocked, taskProgress, type BacklogIndex } from "../core/model/graph";
import { deletionDate } from "../core/model/lifecycle";
import { PRIORITIES, TASK_STATUSES, type Task } from "../core/model/types";
import type { TaskDescription } from "./describe";

const ID_COLUMN_WIDTH = 10;
const STATUS_COLUMN_WIDTH = Math.max(...TASK_STATUSES.map((status) => status.length));
const PRIORITY_COLUMN_WIDTH = Math.max(...PRIORITIES.map((priority) => priority.length));
const PROGRESS_COLUMN_WIDTH = "100%".length;

export function formatTaskRef(task: Task): string {
  return `${task.id} — ${task.title} (${task.status})`;
}

export function formatTaskLine(task: Task, index: BacklogIndex): string {
  const blocked = isBlocked(task, index) ? " [заблокирована]" : "";
  return [
    task.id.padEnd(ID_COLUMN_WIDTH),
    task.status.padEnd(STATUS_COLUMN_WIDTH),
    task.priority.padEnd(PRIORITY_COLUMN_WIDTH),
    formatProgress(taskProgress(task, index)).padStart(PROGRESS_COLUMN_WIDTH),
    `${task.title}${blocked}`,
  ].join("  ");
}

export function formatTaskDetails(description: TaskDescription, fileText: string): string {
  const { task } = description;
  const lines = [
    `${task.id} · ${task.title}`,
    `Файл: ${task.path}`,
    `Тип: ${task.type} · Статус: ${task.status} · Приоритет: ${task.priority} · Прогресс: ${formatProgress(description.progress)}${task.category === undefined ? "" : ` · Категория: ${CATEGORY_LABELS[task.category]}`}`,
  ];
  const deletesAt = deletionDate(task);
  if (deletesAt !== undefined) lines.push(`Закрыта: ${task.closed} · удалится ${formatDay(deletesAt)}`);
  if (task.resolution !== undefined) lines.push(`Причина закрытия: ${task.resolution} — ${task.reason ?? ""}`);
  if (task.verified !== undefined) lines.push(`Проверена: ${task.verified}`);
  if (task.tags.length > 0) lines.push(`Теги: ${task.tags.join(", ")}`);
  if (task.epic !== undefined) lines.push(`Эпик: ${description.epic ? formatTaskRef(description.epic) : `${task.epic} (не найден)`}`);
  if (description.openBlockers.length > 0) lines.push(`Открытые блокеры: ${description.openBlockers.map(formatTaskRef).join("; ")}`);
  if (description.inactiveBlockerIds.length > 0) {
    lines.push(`Закрытые или ненайденные блокеры: ${description.inactiveBlockerIds.join(", ")}`);
  }
  if (description.blocks.length > 0) lines.push(`Блокирует: ${description.blocks.map(formatTaskRef).join("; ")}`);
  if (description.related.length > 0) lines.push(`Связанные: ${description.related.map(formatTaskRef).join("; ")}`);
  if (description.children.length > 0) lines.push(`Задачи эпика: ${description.children.map(formatTaskRef).join("; ")}`);
  if (description.warnings.length > 0) lines.push(`Предупреждения: ${description.warnings.join("; ")}`);
  return [...lines, "", fileText.trimEnd()].join("\n");
}

export function formatDay(date: Date): string {
  return formatLocalIso(date).slice(0, "YYYY-MM-DD".length);
}

function formatProgress(progress: number | null): string {
  return progress === null ? "—" : `${progress}%`;
}
