import { DAY_MS, formatLocalIso } from "../../model/dates";

const daysBefore = (now: Date, days: number) => formatLocalIso(new Date(now.getTime() - days * DAY_MS));

const line = (event: Record<string, unknown>) => `${JSON.stringify(event)}\n`;

export function createdLine(task: string, now: Date, daysAgo: number): string {
  return line({ at: daysBefore(now, daysAgo), task, via: "cli", kind: "created", type: "task", priority: "medium", tags: [] });
}

function closedLine(task: string, now: Date, daysAgo: number): string {
  return line({ at: daysBefore(now, daysAgo), task, via: "cli", kind: "status", from: "backlog", to: "done", resolution: "fixed" });
}

export function journalWithTaskGoneLongAgo(now: Date): string {
  return createdLine("SPA-2", now, 250) + createdLine("SPA-3", now, 210) + closedLine("SPA-3", now, 200) + createdLine("SPA-1", now, 1);
}
