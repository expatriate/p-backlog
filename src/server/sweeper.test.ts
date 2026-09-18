import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { SweepReport } from "../core/store/sweep";
import { startSweeper } from "./sweeper";

function useFakeClock() {
  vi.useFakeTimers();
  onTestFinished(() => void vi.useRealTimers());
}

describe("startSweeper", () => {
  it("проходит сразу и затем по интервалу, пишет итог в лог, после остановки не запускается", async () => {
    useFakeClock();
    const reports: SweepReport[] = [
      { deleted: ["SPA-1", "SPA-4"], skipped: [] },
      { deleted: [], skipped: ["SPA-2"] },
    ];
    const sweep = vi.fn(async () => reports.shift() ?? { deleted: [], skipped: [] });
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
    const sweep = vi.fn().mockRejectedValueOnce(new Error("EACCES")).mockResolvedValue({ deleted: [], skipped: [] });
    const log = vi.fn();

    const stop = startSweeper({ sweep, intervalMs: 1000, log });
    await vi.advanceTimersByTimeAsync(1000);
    stop();

    expect(log).toHaveBeenCalledWith("Не удалось удалить закрытые задачи: EACCES");
    expect(sweep).toHaveBeenCalledTimes(2);
  });
});
