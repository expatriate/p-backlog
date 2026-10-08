import { MEMORY_HISTORY_MS } from "../../core/api/memory";
import { CHURN_DAYS } from "../../core/code/code-window";
import { TEST_DIRECTORIES, TEST_FILE_GLOBS } from "../../core/code/test-paths";
import { HOUR_MS } from "../../core/model/dates";
import { STATS_WEEKS } from "../../core/model/history-window";
import { STALE_URGENT_DAYS } from "../../core/stats/breakdowns";
import { COST_TOTALS_DAYS } from "../../core/stats/cost/cost-report";
import { STATS_DAYS } from "../../core/stats/days";
import { MIN_FIXES_FOR_ESTIMATE } from "../../core/stats/effect/effect-report";

export const STATS_CONSTANTS = {
  statsWeeks: STATS_WEEKS,
  statsDays: STATS_DAYS,
  costTotalsDays: COST_TOTALS_DAYS,
  churnDays: CHURN_DAYS,
  memoryHistoryHours: MEMORY_HISTORY_MS / HOUR_MS,
  staleUrgentDays: STALE_URGENT_DAYS,
  minFixesForEstimate: MIN_FIXES_FOR_ESTIMATE,
  testFileGlobs: TEST_FILE_GLOBS,
  testDirectories: TEST_DIRECTORIES,
};

export type StatsConstants = typeof STATS_CONSTANTS;
