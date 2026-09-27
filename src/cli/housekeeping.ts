import { errorText } from "../core/errors";
import { compactJournalsWhenDue } from "../core/store/journal-compaction";
import { trimRunsWhenStale } from "../core/store/runs";
import { localeLanguage, readLanguage } from "../core/store/settings";
import { cliMessages } from "./messages";

export type HousekeepingRun = { backlogRoot: string; env: NodeJS.ProcessEnv; now: Date; warn: (line: string) => void };

export async function tidyAfterCommand({ backlogRoot, env, now, warn }: HousekeepingRun): Promise<void> {
  const language = await readLanguage(backlogRoot, env).catch(() => localeLanguage(env));
  const messages = cliMessages(language);
  await trimRunsWhenStale(backlogRoot, now).catch((error: unknown) => warn(messages.runsNotTrimmed(errorText(error))));
  await compactJournalsWhenDue(backlogRoot, now).catch((error: unknown) => warn(messages.journalsNotCompacted(errorText(error))));
}
