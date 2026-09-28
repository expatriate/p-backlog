import { coreMessages } from "../core/messages";
import { invalidTasksText, runMaintenance, type MaintenancePlan } from "../core/store/maintenance";
import { trimRunsWhenStale } from "../core/store/runs";
import { localeLanguage, readLanguage } from "../core/store/settings";
import { sweepClosedWhenDue, type SweepReport } from "../core/store/sweep";
import { hookCommand } from "./commands/hook";
import { cliMessages, type CliMessages } from "./messages";

type HousekeepingRun = { backlogRoot: string; argv: readonly string[]; env: NodeJS.ProcessEnv; now: Date; warn: (line: string) => void };

const AFTER_HOOK: MaintenancePlan = { trimRuns: trimRunsWhenStale, sweepClosed: null, compactJournals: false, serviceLog: null };

const AFTER_COMMAND: MaintenancePlan = { trimRuns: trimRunsWhenStale, sweepClosed: sweepClosedWhenDue, compactJournals: true, serviceLog: null };

export async function tidyAfterCommand({ backlogRoot, argv, env, now, warn }: HousekeepingRun): Promise<void> {
  const language = await readLanguage(backlogRoot, env).catch(() => localeLanguage(env));
  const plan = argv[0] === hookCommand.name ? AFTER_HOOK : AFTER_COMMAND;
  const report = await runMaintenance(plan, { root: backlogRoot, now, messages: coreMessages(language), warn });
  if (report !== null) warnAboutSweep(report, cliMessages(language), warn);
}

function warnAboutSweep({ blockingFiles, conflicts, invalid }: SweepReport, messages: CliMessages, warn: (line: string) => void): void {
  if (blockingFiles.length > 0) warn(messages.sweepEpicsBlocked(blockingFiles.join(", ")));
  if (conflicts.length > 0) warn(messages.sweepConflicts(conflicts.join(", ")));
  if (invalid.length > 0) warn(messages.sweepInvalid(invalidTasksText(invalid)));
}
