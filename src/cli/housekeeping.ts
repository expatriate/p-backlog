import { errorText } from "../core/errors";
import { coreMessages } from "../core/messages";
import { compactJournalsWhenDue } from "../core/store/journal-compaction";
import { trimRunsWhenStale } from "../core/store/runs";
import { localeLanguage, readLanguage } from "../core/store/settings";
import { sweepClosedWhenDue, type SweepReport } from "../core/store/sweep";
import { hookCommand } from "./commands/hook";
import { cliMessages, type CliMessages } from "./messages";

export type HousekeepingRun = { backlogRoot: string; argv: readonly string[]; env: NodeJS.ProcessEnv; now: Date; warn: (line: string) => void };

export async function tidyAfterCommand({ backlogRoot, argv, env, now, warn }: HousekeepingRun): Promise<void> {
  const language = await readLanguage(backlogRoot, env).catch(() => localeLanguage(env));
  const messages = cliMessages(language);
  await trimRunsWhenStale(backlogRoot, now).catch((error: unknown) => warn(messages.runsNotTrimmed(errorText(error))));
  if (argv[0] === hookCommand.name) return;
  const report = await sweepClosedWhenDue(backlogRoot, now, coreMessages(language)).catch((error: unknown) => {
    warn(messages.closedNotSwept(errorText(error)));
    return null;
  });
  if (report !== null) warnAboutSweep(report, messages, warn);
  const compactionFailed = (dir: string, error: unknown) => warn(messages.journalNotCompacted(dir, errorText(error)));
  await compactJournalsWhenDue(backlogRoot, now, compactionFailed).catch((error: unknown) => compactionFailed(backlogRoot, error));
}

function warnAboutSweep({ blockingFiles, conflicts, invalid }: SweepReport, messages: CliMessages, warn: (line: string) => void): void {
  if (blockingFiles.length > 0) warn(messages.sweepEpicsBlocked(blockingFiles.join(", ")));
  if (conflicts.length > 0) warn(messages.sweepConflicts(conflicts.join(", ")));
  if (invalid.length > 0) warn(messages.sweepInvalid(invalid.map(({ id, errors }) => `${id} (${errors.join("; ")})`).join(", ")));
}
