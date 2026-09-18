import { DAY_MS } from "../model/lifecycle";
import { PRIORITIES, type Priority, type Task } from "../model/types";
import { closingsOf, reopeningsOf, type TaskHistory, type Transition } from "./history";
import type { AgeBreakdown, AgeBucket, ClosingBreakdown, ClosingReason, Hotspots } from "./types";

const HOTSPOT_LIMIT = 8;
const STALE_URGENT_DAYS = 7;
const AGE_LIMITS: readonly { bucket: AgeBucket; belowDays: number }[] = [
  { bucket: "week", belowDays: 7 },
  { bucket: "month", belowDays: 30 },
  { bucket: "quarter", belowDays: 90 },
  { bucket: "older", belowDays: Number.POSITIVE_INFINITY },
];
const AGENT_SOURCES: ReadonlySet<Transition["via"]> = new Set(["cli", "check", "sweep"]);

export function folderOf(source: string): string {
  const path = source.replace(/(:\d+)+$/, "");
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(0, slash);
}

export function hotspots(openTasks: readonly Task[], withProject: boolean): Hotspots {
  const folders = openTasks.flatMap((task) => {
    if (task.source === undefined) return [];
    const folder = folderOf(task.source);
    return [withProject ? `${task.projectId} · ${folder}` : folder];
  });
  return {
    folders: topCounts(folders).map(([label, count]) => ({ label, count })),
    tags: topCounts(openTasks.flatMap((task) => task.tags)).map(([tag, count]) => ({ tag, count })),
  };
}

export function ageBreakdown(openTasks: readonly Task[], now: Date): AgeBreakdown {
  const ageOf = (task: Task) => (now.getTime() - Date.parse(task.created)) / DAY_MS;
  const bucketOf = (task: Task) => AGE_LIMITS.find(({ belowDays }) => ageOf(task) < belowDays)?.bucket ?? "older";
  return {
    buckets: AGE_LIMITS.map(({ bucket }) => ({ bucket, byPriority: priorityCounts(openTasks.filter((task) => bucketOf(task) === bucket)) })),
    urgentStale: openTasks.filter((task) => (task.priority === "critical" || task.priority === "high") && ageOf(task) >= STALE_URGENT_DAYS).length,
  };
}

export function closingBreakdown(histories: readonly TaskHistory[], from: number, to: number): ClosingBreakdown {
  const inPeriod = (moment: number) => moment >= from && moment <= to;
  const closings = histories.flatMap(closingsOf).filter((closing) => inPeriod(closing.at));
  const created = histories.filter((history) => inPeriod(history.createdAt));
  const byReason: Record<ClosingReason, number> = { done: 0, fixed: 0, obsolete: 0, duplicate: 0, cancelled: 0 };
  for (const closing of closings) byReason[closingReason(closing)] += 1;
  return {
    byReason,
    byActor: {
      agent: closings.filter((closing) => AGENT_SOURCES.has(closing.via)).length,
      human: closings.filter((closing) => closing.via === "web").length,
      unknown: closings.filter((closing) => closing.via === "unknown").length,
    },
    duplicateShare: closings.length === 0 ? null : byReason.duplicate / closings.length,
    withoutSourceShare: created.length === 0 ? null : created.filter((history) => history.source === undefined).length / created.length,
    reopened: histories.flatMap(reopeningsOf).filter((reopening) => inPeriod(reopening.at)).length,
  };
}

function closingReason(closing: Transition): ClosingReason {
  if (closing.resolution === "fixed" || closing.resolution === "obsolete" || closing.resolution === "duplicate") return closing.resolution;
  return closing.to === "cancelled" ? "cancelled" : "done";
}

function priorityCounts(tasks: readonly Task[]): Record<Priority, number> {
  return Object.fromEntries(PRIORITIES.map((priority) => [priority, tasks.filter((task) => task.priority === priority).length])) as Record<Priority, number>;
}

function topCounts(values: readonly string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b)).slice(0, HOTSPOT_LIMIT);
}
