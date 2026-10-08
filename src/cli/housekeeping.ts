import { HOOK_STOP_COMMAND } from "../core/hook-signature";
import type { Language } from "../core/i18n/language";
import { coreMessages } from "../core/messages";
import { compactJournalsWhenDue } from "../core/store/journal-compaction";
import { invalidTasksText, runMaintenance, type MaintenancePlan } from "../core/store/maintenance";
import { trimRunsWhenStale } from "../core/store/runs";
import { sweepClosedWhenDue, type SweepReport } from "../core/store/sweep";
import { cliMessages, type CliMessages } from "./messages";

type HousekeepingRun = { backlogRoot: string; command: string; language: Language; now: Date; warn: (line: string) => void };

const AFTER_HOOK: MaintenancePlan = { trimRuns: trimRunsWhenStale, sweepClosed: null, compactJournals: null, serviceLog: null };

const AFTER_COMMAND: MaintenancePlan = { trimRuns: trimRunsWhenStale, sweepClosed: sweepClosedWhenDue, compactJournals: compactJournalsWhenDue, serviceLog: null };

export async function tidyAfterCommand({ backlogRoot, command, language, now, warn }: HousekeepingRun): Promise<void> {
  const plan = command === HOOK_STOP_COMMAND ? AFTER_HOOK : AFTER_COMMAND;
  const report = await runMaintenance(plan, { root: backlogRoot, now, messages: coreMessages(language), warn });
  if (report !== null) warnAboutSweep(report, cliMessages(language), warn);
}

function warnAboutSweep({ blockingFiles, conflicts, invalid }: SweepReport, messages: CliMessages, warn: (line: string) => void): void {
  if (blockingFiles.length > 0) warn(messages.sweepEpicsBlocked(blockingFiles.join(", ")));
  if (conflicts.length > 0) warn(messages.sweepConflicts(conflicts.join(", ")));
  if (invalid.length > 0) warn(messages.sweepInvalid(invalidTasksText(invalid)));
}
