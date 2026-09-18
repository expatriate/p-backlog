import type { SweepReport } from "../core/store/sweep";

export type SweeperOptions = { sweep: () => Promise<SweepReport>; intervalMs: number; log: (line: string) => void };

export function startSweeper({ sweep, intervalMs, log }: SweeperOptions): () => void {
  const run = () =>
    sweep().then(
      (report) => logReport(report, log),
      (error: unknown) => log(`Не удалось удалить закрытые задачи: ${error instanceof Error ? error.message : String(error)}`),
    );
  void run();
  const timer = setInterval(() => void run(), intervalMs);
  return () => clearInterval(timer);
}

function logReport({ closedEpics, deleted, conflicts, invalid }: SweepReport, log: (line: string) => void): void {
  if (closedEpics.length > 0) log(`Закрыты завершённые эпики: ${closedEpics.join(", ")}`);
  if (deleted.length > 0) log(`Удалены закрытые задачи: ${deleted.join(", ")}`);
  if (conflicts.length > 0) log(`Задачи менялись во время прохода, повторю при следующем: ${conflicts.join(", ")}`);
  if (invalid.length > 0) {
    log(`Не удалось обновить задачи, исправьте файлы: ${invalid.map(({ id, errors }) => `${id} (${errors.join("; ")})`).join(", ")}`);
  }
}
