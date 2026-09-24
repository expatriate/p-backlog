import { errorText } from "../core/errors";
import type { SweepReport } from "../core/store/sweep";
import { serverRu, type ServerMessages } from "./messages.ru";

export type SweeperOptions = {
  sweep: () => Promise<SweepReport>;
  intervalMs: number;
  log: (line: string) => void;
  warn: (line: string) => void;
  messages?: () => Promise<ServerMessages>;
};

export function startSweeper({ sweep, intervalMs, log, warn, messages = () => Promise.resolve(serverRu) }: SweeperOptions): () => Promise<void> {
  let current = Promise.resolve();
  const run = async () => {
    let texts = serverRu;
    try {
      texts = await messages();
      logReport(await sweep(), texts, log);
    } catch (error) {
      warn(texts.sweepFailed(errorText(error)));
    }
  };
  const trigger = () => {
    current = run();
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
