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
