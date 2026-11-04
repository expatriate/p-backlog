import { onlineManager } from "@tanstack/react-query";
import { describe, expect, it, onTestFinished } from "vitest";
import { ApiError } from "../api/client";
import { createQueryClient } from "./query-client";

async function attemptsUntilFailure(status: number): Promise<number> {
  let attempts = 0;
  const queryFn = () => {
    attempts += 1;
    return Promise.reject(new ApiError(status, []));
  };
  await expect(createQueryClient().query({ queryKey: ["probe"], queryFn, retryDelay: 0 })).rejects.toBeInstanceOf(ApiError);
  return attempts;
}

describe("createQueryClient", () => {
  it("повторяет запрос, только когда сервер недоступен или упал, — «не найдено» и отказ показываются сразу", async () => {
    expect(await attemptsUntilFailure(0)).toBe(2);
    expect(await attemptsUntilFailure(500)).toBe(2);
    expect(await attemptsUntilFailure(404)).toBe(1);
    expect(await attemptsUntilFailure(422)).toBe(1);
  });

  it("браузер без сети не ставит загрузку на паузу: локальный сервер отвечает и так", async () => {
    onlineManager.setOnline(false);
    onTestFinished(() => onlineManager.setOnline(true));

    await expect(createQueryClient().query({ queryKey: ["probe"], queryFn: () => Promise.resolve("stats") })).resolves.toBe("stats");
  });
});
