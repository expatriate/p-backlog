import type { Priority } from "../model/types";

export type ClosingReason = "done" | "fixed" | "obsolete" | "duplicate" | "cancelled";
export type AgeBucket = "week" | "month" | "quarter" | "older";

export type WeekFlow = { start: string; created: number; closed: number; openAtEnd: number };

export type StatsTotals = {
  open: number;
  openWeight: number;
  createdLastWeek: number;
  closedLastWeek: number;
  ageMedianDays: number | null;
  olderThan30Days: number;
  leadTimeMedianDays: number | null;
  leadTimeP90Days: number | null;
};

export type Hotspots = { folders: { label: string; count: number }[]; tags: { tag: string; count: number }[] };

export type AgeBreakdown = { buckets: { bucket: AgeBucket; byPriority: Record<Priority, number> }[]; urgentStale: number };

export type ClosingBreakdown = {
  byReason: Record<ClosingReason, number>;
  byActor: { agent: number; human: number; unknown: number };
  duplicateShare: number | null;
  withoutSourceShare: number | null;
  reopened: number;
};

export type StatsReport = {
  taskCount: number;
  journalSince: string | null;
  invalidJournalLines: number;
  totals: StatsTotals;
  weeks: WeekFlow[];
  hotspots: Hotspots;
  age: AgeBreakdown;
  closing: ClosingBreakdown;
};

export type WorkStatus = "in-progress" | "blocked";
export type LongestInWork = { id: string; projectId: string; title: string; status: WorkStatus; days: number; atLeast: boolean };
export type FlowNow = { inProgress: number; blocked: number; longest: LongestInWork[] };
export type FlowCycle = { medianDays: number | null; p90Days: number | null; blockedShare: number | null; sample: number };
export type WipWeek = { start: string; max: number | null };
export type FlowWip = { weeks: WipWeek[]; current: number };

export type FlowForecast = { closed: number; created: number; open: number; weeklyNet: number; weeks: number | null; until: string | null };
export type EpicFlow = { id: string; projectId: string; title: string; closed: number; total: number; weeks: number | null };
export type FlowReport = {
  taskCount: number;
  journalSince: string | null;
  invalidJournalLines: number;
  now: FlowNow;
  cycle: FlowCycle;
  wip: FlowWip;
  forecast: FlowForecast;
  epics: EpicFlow[];
};
