import type { CandidateEvidence, FoundHow, RecordedMethod } from "../journal/events";
import type { Priority, TaskCategory } from "../model/types";

export type ClosingReason = "done" | "fixed" | "obsolete" | "duplicate" | "cancelled";
export type AgeBucket = "week" | "month" | "quarter" | "older";

export type WeekFlow = { start: string; created: number; closed: number; openAtEnd: number };
export type DayFlow = { day: string; created: number };

export type PreviousTotals = { open: number; net: number; ageMedianDays: number | null; leadTimeMedianDays: number | null };

export type StatsTotals = {
  open: number;
  openWeight: number;
  createdLastWeek: number;
  closedLastWeek: number;
  ageMedianDays: number | null;
  olderThan30Days: number;
  leadTimeMedianDays: number | null;
  leadTimeP90Days: number | null;
  createdToday: number;
  closedToday: number;
  previous: PreviousTotals | null;
};

export type Hotspots = { folders: { label: string; count: number }[]; tags: { tag: string; count: number }[] };

export type AgeBreakdown = { buckets: { bucket: AgeBucket; byPriority: Record<Priority, number> }[]; urgentStale: number };

export type ClosingBreakdown = {
  byReason: Record<ClosingReason, number>;
  duplicateShare: number | null;
  withoutSourceShare: number | null;
  reopened: number;
};

export type ReportHead = { taskCount: number; journalSince: string | null; invalidJournalLines: number };

export type StatsReport = ReportHead & {
  totals: StatsTotals;
  weeks: WeekFlow[];
  days: DayFlow[];
  hotspots: Hotspots;
  age: AgeBreakdown;
  closing: ClosingBreakdown;
};

export type WorkStatus = "in-progress" | "blocked";
export type LongestInWork = { id: string; projectId: string; title: string; status: WorkStatus; days: number; atLeast: boolean };
export type FlowForecast = { closed: number; created: number; open: number; weeklyNet: number; weeks: number | null; until: string | null; windowWeeks: number };

export type CommitUnit = { date: string; lines: number };
export type RepoCode = { commits: string[][]; lines: { path: string; lines: number }[]; units: CommitUnit[] };
export type ProjectCode = { projectId: string; name: string; repos: RepoCode[] };
export type FixCommit = { date: string; byAgent: boolean; lines: number; testLines: number };
export type ScannedCode = { projects: ProjectCode[]; unavailableRepos: string[] };
export type CollectedCode = ScannedCode & { fixCommits: ReadonlyMap<string, FixCommit> };
export type ChurnRow = { label: string; commits: number; tasks: number; weight: number; score: number };
export type DensityRow = { lines: number; open: number; perKloc: number | null };
export type ProjectDensity = DensityRow & { projectId: string; name: string };
export type FolderDensity = DensityRow & { label: string };
export type CodeDensity = { projects: ProjectDensity[]; folders: FolderDensity[] };
export type CodeReport = ReportHead & {
  unavailableRepos: string[];
  churn: ChurnRow[];
  density: CodeDensity;
};

export type AccuracyWeek = { start: string; decided: number; precision: number | null };

export type AccuracyRow = { evidence: CandidateEvidence | "total"; candidates: number; closed: number; verified: number; open: number; precision: number | null };
export type MethodAccuracyRow = { by: RecordedMethod; candidates: number; closed: number; verified: number; open: number; precision: number | null };
export type CategoryRow = { category: TaskCategory | null; open: number; weight: number; created: number; closed: number };
export type FoundRow = { found: FoundHow | null; created: number; open: number; fixed: number };
export type BranchRow = { label: string; created: number; open: number };
export type QualityReport = ReportHead & {
  accuracy: AccuracyRow[];
  accuracyWeeks: AccuracyWeek[];
  methodAccuracy: MethodAccuracyRow[];
  categories: CategoryRow[];
  found: FoundRow[];
  branches: BranchRow[];
};

export type EffectTotals = { realLines: number; fixedTasks: number; fixedLines: number; openTasks: number; estimatedLines: number | null; deferredLines: number; deferredTestLines: number; noiseShare: number | null };
export type EffectPeriod = { start: string; onTopicLines: number; deferredLines: number; deferredTestLines: number; deferredTasks: number };
export type EffectProject = { projectId: string; name: string; realLines: number; deferredTasks: number; fixedLines: number; estimatedLines: number | null; noiseShare: number | null };
export type EffectReport = ReportHead & {
  unavailableRepos: string[];
  totals: EffectTotals;
  weeks: EffectPeriod[];
  days: EffectPeriod[];
  projects: EffectProject[];
};

type SignalKind = "debt-growing" | "urgent-stale" | "stuck" | "noisy-check" | "low-changed" | "stale-low";
export type Signal = { kind: SignalKind; text: string };
export type SignalsReport = { signals: Signal[] };

export type TokenCounts = { input: number; cacheWrite5m: number; cacheWrite1h: number; cacheRead: number; output: number };
type UsageKind = "hook" | "cli" | "skill";
export type UsageBucket = { slot: string; cwd: string; model: string; kind: UsageKind; tokens: TokenCounts; hookTurns: number };
export type TranscriptState = {
  hookOpen: boolean;
  lastModel: string | null;
  lastMessageId: string | null;
  pending: Record<string, "cli" | "skill">;
  pendingEstimates: { kind: "cli" | "skill"; chars: number; slot: string; cwd: string }[];
};

export type CliRun = { at: string; command: string; cwd: string; ms: number; rssMb: number; exitCode: number };

export type ScanProgress = { listed: boolean; filesTotal: number; filesDone: number; bytesLeft: number };
export type CostTotals = { tokens: number; cost: number | null; hasUnpricedTokens: boolean; hookTurns: number; cliRuns: number; hookRuns: number };
export type CostDay = { day: string; hookTokens: number; cliTokens: number; cost: number | null; hookTurns: number; cliRuns: number; hookRuns: number };
export type CostModel = { model: string; tokens: number; cost: number | null };
export type CostCommand = { command: string; runs: number; avgMs: number; avgRssMb: number; maxRssMb: number };
export type CostReport = { scan: ScanProgress; since: string | null; totals: CostTotals; days: CostDay[]; models: CostModel[]; commands: CostCommand[] };

export type MemorySample = { at: string; rssMb: number; heapUsedMb: number };
