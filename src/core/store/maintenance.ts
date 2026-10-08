import { errorText, warnOnFailure, warnPathErrors, type PathErrorHandler } from "../errors";
import type { CoreMessages } from "../messages";
import { SERVICE_LOG_KEPT_BYTES, SERVICE_LOG_LIMIT_BYTES, trimLogFile } from "../service-log";
import type { CompactionFailed } from "./journal-compaction";
import type { SweepReport } from "./sweep";

export type MaintenancePlan = {
  trimRuns: (root: string, now: Date) => Promise<unknown>;
  sweepClosed: ((root: string, now: Date, messages: CoreMessages, onError: PathErrorHandler) => Promise<SweepReport | null>) | null;
  compactJournals: ((root: string, now: Date, failed: CompactionFailed) => Promise<unknown>) | null;
  serviceLog: string | null;
};

export type MaintenanceRun = { root: string; now: Date; messages: CoreMessages; warn: (line: string) => void };

export async function runMaintenance(plan: MaintenancePlan, { root, now, messages, warn }: MaintenanceRun): Promise<SweepReport | null> {
  await warnOnFailure(plan.trimRuns(root, now), warn, messages.runsNotTrimmed);
  const report = plan.sweepClosed === null ? null : await warnOnFailure(plan.sweepClosed(root, now, messages, warnPathErrors(warn)), warn, messages.closedNotSwept);
  if (plan.compactJournals !== null) {
    const compactionFailed = (dir: string, error: unknown) => warn(messages.journalNotCompacted(dir, errorText(error)));
    await warnOnFailure(plan.compactJournals(root, now, compactionFailed), warn, (error) => messages.journalNotCompacted(root, error));
  }
  if (plan.serviceLog !== null) await warnOnFailure(trimLogFile(plan.serviceLog, SERVICE_LOG_LIMIT_BYTES, SERVICE_LOG_KEPT_BYTES), warn, messages.serviceLogNotTrimmed);
  return report;
}

export function invalidTasksText(invalid: SweepReport["invalid"]): string {
  return invalid.map(({ id, errors }) => `${id} (${errors.join("; ")})`).join(", ");
}
