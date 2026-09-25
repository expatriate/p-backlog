import { errorText } from "../core/errors";
import type { SweepReport } from "../core/store/sweep";
import type { ServerMessages } from "./messages.ru";

export type SweeperOptions = {
  sweep: () => Promise<SweepReport>;
  intervalMs: number;
  log: (line: string) => void;
  warn: (line: string) => void;
  messages: () => Promise<ServerMessages>;
};

export function startSweeper({ sweep, intervalMs, log, warn, messages }: SweeperOptions): () => Promise<void> {
  let current = Promise.resolve();
  const run = async () => {
    const outcome = await sweep().then(
      (report) => ({ report }),
      (error: unknown) => ({ error }),
    );
    const texts = await messages();
    if ("report" in outcome) logReport(outcome.report, texts, log);
    else warn(texts.sweepFailed(errorText(outcome.error)));
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

function logReport({ closedEpics, blockingFiles, deleted, conflicts, invalid }: SweepReport, messages: ServerMessages, log: (line: string) => void): void {
  if (closedEpics.length > 0) log(messages.closedEpics(closedEpics.join(", ")));
  if (blockingFiles.length > 0) log(messages.epicsBlockedByFiles(blockingFiles.join(", ")));
  if (deleted.length > 0) log(messages.deletedClosedTasks(deleted.join(", ")));
  if (conflicts.length > 0) log(messages.conflictedDuringSweep(conflicts.join(", ")));
  if (invalid.length > 0) {
    log(messages.invalidAfterSweep(invalid.map(({ id, errors }) => `${id} (${errors.join("; ")})`).join(", ")));
  }
}
