import { warnOnFailure, warnPathErrors } from "../errors";
import type { StoreMessages } from "../messages/store-messages";
import { SERVICE_LOG_KEPT_BYTES, SERVICE_LOG_LIMIT_BYTES, trimLogFile } from "../service-log";
import type { CompactionReports } from "./journal-compaction";
import type { SweepReport } from "./sweep";
import type { WriteContext } from "./write-context";

export type MaintenancePlan = {
  trimRuns: (root: string, writes: WriteContext) => Promise<unknown>;
  sweepClosed: ((root: string, writes: WriteContext, messages: StoreMessages) => Promise<SweepReport | null>) | null;
  compactJournals: ((root: string, now: Date, reports: CompactionReports) => Promise<unknown>) | null;
  serviceLog: string | null;
};

export type MaintenanceRun = { root: string; now: Date; messages: StoreMessages; warn: (line: string) => void };

export async function runMaintenance(plan: MaintenancePlan, { root, now, messages, warn }: MaintenanceRun): Promise<SweepReport | null> {
  const onError = warnPathErrors(warn);
  const writes = { now, onError };
  await warnOnFailure(plan.trimRuns(root, writes), warn, messages.runsNotTrimmed);
  const report = plan.sweepClosed === null ? null : await warnOnFailure(plan.sweepClosed(root, writes, messages), warn, messages.closedNotSwept);
  if (plan.compactJournals !== null) {
    const reports = { failed: warnPathErrors(warn, messages.journalNotCompacted), onError };
    await warnOnFailure(plan.compactJournals(root, now, reports), warn, (error) => messages.journalNotCompacted(root, error));
  }
  if (plan.serviceLog !== null) await warnOnFailure(trimLogFile(plan.serviceLog, SERVICE_LOG_LIMIT_BYTES, SERVICE_LOG_KEPT_BYTES), warn, messages.serviceLogNotTrimmed);
  return report;
}

export function invalidTasksText(invalid: SweepReport["invalid"]): string {
  return invalid.map(({ id, errors }) => `${id} (${errors.join("; ")})`).join(", ");
}
