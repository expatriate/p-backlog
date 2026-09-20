import { errorText } from "../core/errors";
import type { SweepReport } from "../core/store/sweep";

export type SweeperOptions = { sweep: () => Promise<SweepReport>; intervalMs: number; log: (line: string) => void; warn: (line: string) => void };

export function startSweeper({ sweep, intervalMs, log, warn }: SweeperOptions): () => void {
  const run = () =>
    sweep().then(
      (report) => logReport(report, log),
      (error: unknown) => warn(`Не удалось удалить закрытые задачи: ${errorText(error)}`),
    );
  void run();
  const timer = setInterval(() => void run(), intervalMs);
  return () => clearInterval(timer);
}

function logReport({ closedEpics, blockingFiles, deleted, conflicts, invalid }: SweepReport, log: (line: string) => void): void {
  if (closedEpics.length > 0) log(`Закрыты завершённые эпики: ${closedEpics.join(", ")}`);
  if (blockingFiles.length > 0) log(`Эпики не закрываются, пока не разобраны файлы: ${blockingFiles.join(", ")}`);
  if (deleted.length > 0) log(`Удалены закрытые задачи: ${deleted.join(", ")}`);
  if (conflicts.length > 0) log(`Задачи менялись во время прохода, повторю при следующем: ${conflicts.join(", ")}`);
  if (invalid.length > 0) {
    log(`Не удалось обновить задачи, исправьте файлы: ${invalid.map(({ id, errors }) => `${id} (${errors.join("; ")})`).join(", ")}`);
  }
}
