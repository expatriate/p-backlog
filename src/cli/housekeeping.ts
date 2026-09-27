import { errorText } from "../core/errors";
import { coreMessages } from "../core/messages";
import { compactJournalsWhenDue } from "../core/store/journal-compaction";
import { trimRunsWhenStale } from "../core/store/runs";
import { localeLanguage, readLanguage } from "../core/store/settings";
import { sweepClosedWhenDue } from "../core/store/sweep";
import { hookCommand } from "./commands/hook";
import { cliMessages } from "./messages";

export type HousekeepingRun = { backlogRoot: string; argv: readonly string[]; env: NodeJS.ProcessEnv; now: Date; warn: (line: string) => void };

export async function tidyAfterCommand({ backlogRoot, argv, env, now, warn }: HousekeepingRun): Promise<void> {
  const language = await readLanguage(backlogRoot, env).catch(() => localeLanguage(env));
  const messages = cliMessages(language);
  const compactionFailed = (dir: string, error: unknown) => warn(messages.journalNotCompacted(dir, errorText(error)));
  await trimRunsWhenStale(backlogRoot, now).catch((error: unknown) => warn(messages.runsNotTrimmed(errorText(error))));
  if (argv[0] === hookCommand.name) return;
  await sweepClosedWhenDue(backlogRoot, now, coreMessages(language)).catch((error: unknown) => warn(messages.closedNotSwept(errorText(error))));
  await compactJournalsWhenDue(backlogRoot, now, compactionFailed).catch((error: unknown) => compactionFailed(backlogRoot, error));
}
