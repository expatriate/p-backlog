import { PRIORITIES, type Priority, type Task } from "../model/types";
import { closingsOf, reopeningsOf, type TaskHistory, type Transition } from "./history";
import type { AgeBreakdown, AgeBucket, ClosingBreakdown, ClosingReason, Hotspots } from "./types";
import type { ProjectLabel } from "./format";
import { countBy, daysBetween } from "./numbers";
import type { Period } from "./period";
import { DAYS_PER_WEEK } from "./weeks";

const HOTSPOT_LIMIT = 8;
export const STALE_URGENT_DAYS = 7;
const AGE_LIMITS: readonly { bucket: AgeBucket; belowDays: number }[] = [
  { bucket: "week", belowDays: DAYS_PER_WEEK },
  { bucket: "month", belowDays: 30 },
  { bucket: "quarter", belowDays: 90 },
  { bucket: "older", belowDays: Number.POSITIVE_INFINITY },
];

export function folderOf(source: string): string {
  const path = source.replace(/(:\d+)+$/, "");
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(0, slash);
}

export function hotspots(openTasks: readonly Task[], projectLabel: ProjectLabel): Hotspots {
  const folders = openTasks.flatMap((task) => {
    if (task.source === undefined) return [];
    const folder = folderOf(task.source);
    return [projectLabel(task.projectId, folder)];
  });
  return {
    folders: topCounts(folders).map(([label, count]) => ({ label, count })),
    tags: topCounts(openTasks.flatMap((task) => task.tags)).map(([tag, count]) => ({ tag, count })),
  };
}

export function ageBreakdown(openTasks: readonly Task[], now: Date): AgeBreakdown {
  const ageOf = (task: Task) => daysBetween(Date.parse(task.created), now.getTime());
  const bucketOf = (task: Task) => AGE_LIMITS.find(({ belowDays }) => ageOf(task) < belowDays)?.bucket ?? "older";
  return {
    buckets: AGE_LIMITS.map(({ bucket }) => ({ bucket, byPriority: priorityCounts(openTasks.filter((task) => bucketOf(task) === bucket)) })),
    urgentStale: urgentStaleCount(openTasks, now),
  };
}

export function urgentStaleCount(openTasks: readonly Task[], now: Date): number {
  return openTasks.filter((task) => (task.priority === "critical" || task.priority === "high") && daysBetween(Date.parse(task.created), now.getTime()) >= STALE_URGENT_DAYS).length;
}

export function closingBreakdown(histories: readonly TaskHistory[], period: Period): ClosingBreakdown {
  const closings = histories.flatMap(closingsOf).filter((closing) => period.contains(closing.at));
  const created = histories.filter((history) => period.contains(history.createdAt));
  const byReason: Record<ClosingReason, number> = { done: 0, fixed: 0, obsolete: 0, duplicate: 0, cancelled: 0, unknown: 0 };
  for (const closing of closings) byReason[closingReason(closing)] += 1;
  return {
    byReason,
    duplicateShare: closings.length === 0 ? null : byReason.duplicate / closings.length,
    withoutSourceShare: created.length === 0 ? null : created.filter((history) => history.source === undefined).length / created.length,
    reopened: histories.flatMap(reopeningsOf).filter((reopening) => period.contains(reopening.at)).length,
  };
}

function closingReason(closing: Transition): ClosingReason {
  if (closing.resolution === "unknown") return "unknown";
  if (closing.resolution === "fixed" || closing.resolution === "obsolete" || closing.resolution === "duplicate") return closing.resolution;
  return closing.to === "cancelled" ? "cancelled" : "done";
}

function priorityCounts(tasks: readonly Task[]): Record<Priority, number> {
  return Object.fromEntries(PRIORITIES.map((priority) => [priority, tasks.filter((task) => task.priority === priority).length])) as Record<Priority, number>;
}

function topCounts(values: readonly string[]): [string, number][] {
  const counts = countBy(values, (value) => value);
  return [...counts.entries()].sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b)).slice(0, HOTSPOT_LIMIT);
}
