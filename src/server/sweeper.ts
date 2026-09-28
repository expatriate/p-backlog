import { errorText } from "../core/errors";
import { invalidTasksText } from "../core/store/maintenance";
import type { SweepReport } from "../core/store/sweep";
import type { ServerMessages } from "./messages";

export type SweeperOptions = {
  maintain: () => Promise<SweepReport | null>;
  intervalMs: number;
  log: (line: string) => void;
  warn: (line: string) => void;
  messages: () => Promise<ServerMessages>;
};

export function startSweeper({ maintain, intervalMs, log, warn, messages }: SweeperOptions): () => Promise<void> {
  let current = Promise.resolve();
  const run = async () => {
    const report = await maintain();
    if (report !== null) logReport(report, await messages(), log);
  };
  const trigger = () => {
    current = run().catch((error: unknown) => warn(errorText(error)));
  };
  trigger();
  const timer = setInterval(trigger, intervalMs);
  return () => {
    clearInterval(timer);
    return current;
  };
}

function logReport({ closedEpics, reopenedEpics, blockingFiles, deleted, conflicts, invalid }: SweepReport, messages: ServerMessages, log: (line: string) => void): void {
  if (closedEpics.length > 0) log(messages.closedEpics(closedEpics.join(", ")));
  if (reopenedEpics.length > 0) log(messages.reopenedEpics(reopenedEpics.join(", ")));
  if (blockingFiles.length > 0) log(messages.epicsBlockedByFiles(blockingFiles.join(", ")));
  if (deleted.length > 0) log(messages.deletedClosedTasks(deleted.join(", ")));
  if (conflicts.length > 0) log(messages.conflictedDuringSweep(conflicts.join(", ")));
  if (invalid.length > 0) log(messages.invalidAfterSweep(invalidTasksText(invalid)));
}
