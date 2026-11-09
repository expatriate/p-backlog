import { warnOnFailure, warnPathErrors, type PathErrorHandler } from "../errors";
import type { StoreMessages } from "../messages/store-messages";
import { SERVICE_LOG_KEPT_BYTES, SERVICE_LOG_LIMIT_BYTES, trimLogFile } from "../service-log";
import type { SweepReport } from "./sweep";
import type { WriteContext } from "./write-context";

export type MaintenancePlan = {
  trimRuns: (root: string, writes: WriteContext) => Promise<unknown>;
  sweepClosed: ((root: string, writes: WriteContext, messages: StoreMessages) => Promise<SweepReport | null>) | null;
  compactJournals: ((root: string, writes: WriteContext, onNotCompacted: PathErrorHandler) => Promise<unknown>) | null;
  serviceLog: string | null;
};

export type MaintenanceRun = { root: string; now: Date; messages: StoreMessages; warn: (line: string) => void };

export async function runMaintenance(plan: MaintenancePlan, { root, now, messages, warn }: MaintenanceRun): Promise<SweepReport | null> {
  const writes = { now, onError: warnPathErrors(warn) };
  await warnOnFailure(plan.trimRuns(root, writes), warn, messages.runsNotTrimmed);
  const report = plan.sweepClosed === null ? null : await warnOnFailure(plan.sweepClosed(root, writes, messages), warn, messages.closedNotSwept);
  if (plan.compactJournals !== null) {
    const onNotCompacted = warnPathErrors(warn, messages.journalNotCompacted);
    await warnOnFailure(plan.compactJournals(root, writes, onNotCompacted), warn, (error) => messages.journalNotCompacted(root, error));
  }
  if (plan.serviceLog !== null) await warnOnFailure(trimLogFile(plan.serviceLog, SERVICE_LOG_LIMIT_BYTES, SERVICE_LOG_KEPT_BYTES), warn, messages.serviceLogNotTrimmed);
  return report;
}

export function invalidTasksText(invalid: SweepReport["invalid"]): string {
  return invalid.map(({ id, errors }) => `${id} (${errors.join("; ")})`).join(", ");
}
