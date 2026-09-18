import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { SweepReport } from "../core/store/sweep";
import { startSweeper } from "./sweeper";

const EMPTY_REPORT: SweepReport = { closedEpics: [], deleted: [], conflicts: [], invalid: [] };

function useFakeClock() {
  vi.useFakeTimers();
  onTestFinished(() => void vi.useRealTimers());
}

describe("startSweeper", () => {
  it("проходит сразу и затем по интервалу, пишет итог в лог, после остановки не запускается", async () => {
    useFakeClock();
    const reports: SweepReport[] = [
      { ...EMPTY_REPORT, deleted: ["SPA-1", "SPA-4"] },
      { ...EMPTY_REPORT, conflicts: ["SPA-2"] },
    ];
    const sweep = vi.fn(async () => reports.shift() ?? EMPTY_REPORT);
    const log = vi.fn();

    const stop = startSweeper({ sweep, intervalMs: 1000, log });
    await vi.advanceTimersByTimeAsync(0);
    expect(sweep).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("Удалены закрытые задачи: SPA-1, SPA-4");

    await vi.advanceTimersByTimeAsync(1000);
    expect(sweep).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenLastCalledWith("Задачи менялись во время прохода, повторю при следующем: SPA-2");

    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(sweep).toHaveBeenCalledTimes(2);
  });

  it("ошибка прохода попадает в лог и не останавливает следующие", async () => {
    useFakeClock();
    const sweep = vi.fn().mockRejectedValueOnce(new Error("EACCES")).mockResolvedValue(EMPTY_REPORT);
    const log = vi.fn();

    const stop = startSweeper({ sweep, intervalMs: 1000, log });
    await vi.advanceTimersByTimeAsync(1000);
    stop();

    expect(log).toHaveBeenCalledWith("Не удалось удалить закрытые задачи: EACCES");
    expect(sweep).toHaveBeenCalledTimes(2);
  });

  it("каждая непустая часть итога — отдельной строкой лога", async () => {
    useFakeClock();
    const report: SweepReport = {
      closedEpics: ["SPA-7", "SPA-8"],
      deleted: ["SPA-1"],
      conflicts: ["SPA-2", "SPA-3"],
      invalid: [
        { id: "SPA-4", errors: ["задача не может блокировать саму себя", "reason задаётся только вместе с resolution"] },
        { id: "SPA-5", errors: ["эпик SPA-9 не найден"] },
      ],
    };
    const log = vi.fn();

    const stop = startSweeper({ sweep: async () => report, intervalMs: 1000, log });
    await vi.advanceTimersByTimeAsync(0);
    stop();

    expect(log.mock.calls).toEqual([
      ["Закрыты завершённые эпики: SPA-7, SPA-8"],
      ["Удалены закрытые задачи: SPA-1"],
      ["Задачи менялись во время прохода, повторю при следующем: SPA-2, SPA-3"],
      [
        "Не удалось обновить задачи, исправьте файлы: SPA-4 (задача не может блокировать саму себя; reason задаётся только вместе с resolution), SPA-5 (эпик SPA-9 не найден)",
      ],
    ]);
  });
});
