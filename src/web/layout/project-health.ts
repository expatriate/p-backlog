import type { BacklogIndex } from "../../core/model/graph";
import { filterTasks, OPEN_STATUSES } from "../../core/model/query";
import type { Task } from "../../core/model/types";

export type ProjectHealth = { open: number; critical: number; high: number; rest: number };

export function projectHealth(tasks: readonly Task[], index: BacklogIndex): ProjectHealth {
  const open = filterTasks(tasks, { statuses: OPEN_STATUSES }, index);
  const critical = open.filter((task) => task.priority === "critical").length;
  const high = open.filter((task) => task.priority === "high").length;
  return { open: open.length, critical, high, rest: open.length - critical - high };
}

export function healthSpeech(health: ProjectHealth): string {
  if (health.open === 0) return "открытых задач нет";
  return `открыто ${health.open}: критичных ${health.critical}, высоких ${health.high}`;
}
