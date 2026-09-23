import { formatLocalIso } from "../core/model/dates";
import { isBlocked, taskProgress, type BacklogIndex } from "../core/model/graph";
import { deletionDate } from "../core/model/lifecycle";
import { PRIORITIES, TASK_STATUSES, type Task } from "../core/model/types";
import type { CoreMessages } from "../core/messages";
import type { TaskDescription } from "./describe";
import type { CliMessages } from "./messages";

const ID_COLUMN_WIDTH = 10;
const STATUS_COLUMN_WIDTH = Math.max(...TASK_STATUSES.map((status) => status.length));
const PRIORITY_COLUMN_WIDTH = Math.max(...PRIORITIES.map((priority) => priority.length));
const PROGRESS_COLUMN_WIDTH = "100%".length;

export function formatTaskRef(task: Task): string {
  return `${task.id} — ${task.title} (${task.status})`;
}

export function formatTaskLine(cli: CliMessages, task: Task, index: BacklogIndex): string {
  const blocked = isBlocked(task, index) ? cli.blockedSuffix : "";
  return [
    task.id.padEnd(ID_COLUMN_WIDTH),
    task.status.padEnd(STATUS_COLUMN_WIDTH),
    task.priority.padEnd(PRIORITY_COLUMN_WIDTH),
    formatProgress(taskProgress(task, index)).padStart(PROGRESS_COLUMN_WIDTH),
    `${task.title}${blocked}`,
  ].join("  ");
}

export function formatTaskDetails(messages: CoreMessages, cli: CliMessages, description: TaskDescription, fileText: string): string {
  const { task } = description;
  const categoryTail = task.category === undefined ? "" : cli.categoryTail(messages.categoryLabel(task.category));
  const lines = [
    `${task.id} · ${task.title}`,
    cli.fileLine(task.path),
    cli.summaryLine({ type: task.type, status: task.status, priority: task.priority, progress: formatProgress(description.progress), categoryTail }),
  ];
  const deletesAt = deletionDate(task);
  if (deletesAt !== undefined) lines.push(cli.closedLine(task.closed ?? "", formatDay(deletesAt)));
  if (task.resolution !== undefined) lines.push(cli.reasonLine(task.resolution, task.reason ?? ""));
  if (task.verified !== undefined) lines.push(cli.verifiedLine(task.verified));
  if (task.tags.length > 0) lines.push(cli.tagsLine(task.tags.join(", ")));
  if (task.epic !== undefined) lines.push(cli.epicLine(description.epic ? formatTaskRef(description.epic) : cli.epicNotFound(task.epic)));
  if (description.openBlockers.length > 0) lines.push(cli.openBlockersLine(description.openBlockers.map(formatTaskRef).join("; ")));
  if (description.inactiveBlockerIds.length > 0) {
    lines.push(cli.inactiveBlockersLine(description.inactiveBlockerIds.join(", ")));
  }
  if (description.blocks.length > 0) lines.push(cli.blocksLine(description.blocks.map(formatTaskRef).join("; ")));
  if (description.related.length > 0) lines.push(cli.relatedLine(description.related.map(formatTaskRef).join("; ")));
  if (description.children.length > 0) lines.push(cli.epicChildrenLine(description.children.map(formatTaskRef).join("; ")));
  if (description.warnings.length > 0) lines.push(cli.warningsLine(description.warnings.map(messages.problem).join("; ")));
  return [...lines, "", fileText.trimEnd()].join("\n");
}

export function formatDay(date: Date): string {
  return formatLocalIso(date).slice(0, "YYYY-MM-DD".length);
}

function formatProgress(progress: number | null): string {
  return progress === null ? "—" : `${progress}%`;
}
