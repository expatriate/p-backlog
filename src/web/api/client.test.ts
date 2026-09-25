import { describe, expect, it, vi } from "vitest";
import type { BatchRequest, BatchResponse } from "../../core/api/contract";
import type { Task } from "../../core/model/types";
import { ApiError, createApiClient, isServerUnreachable, type ApiFetch } from "./client";

function respond(status: number, body: unknown, contentType = "application/json"): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new Response(text, { status, headers: { "content-type": contentType } });
}

function clientReturning(response: Response) {
  return createApiClient(async () => response);
}

const task = { id: "SPA-1", title: "Задача" } as Task;

describe("batchTasks", () => {
  it("отправляет POST /api/tasks/batch с телом запроса и возвращает разобранный ответ", async () => {
    const outcome: BatchResponse = { results: [{ id: "SPA-3", outcome: "done", version: "2", previous: { status: "backlog", priority: "medium", epic: null, resolution: null, reason: null } }] };
    const apiFetch = vi.fn<ApiFetch>(async () => respond(200, outcome));
    const client = createApiClient(apiFetch);
    const batch: BatchRequest = { tasks: [{ id: "SPA-3", version: "1" }], action: { kind: "close", reason: "неактуально" } };

    const result = await client.batchTasks(batch);

    expect(result).toEqual(outcome);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [path, init] = apiFetch.mock.calls[0] ?? [];
    expect(path).toBe("/api/tasks/batch");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual(batch);
  });
});

describe("ApiError", () => {
  it("несёт статус и сообщения сервера", async () => {
    const client = clientReturning(respond(422, { errors: ["Нераспознанный ключ: id"] }));

    const error = await client.tasks().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, errors: ["Нераспознанный ключ: id"] });
    expect((error as ApiError).message).toContain("Нераспознанный ключ: id");
  });

  it("несёт актуальную задачу из конфликта версий", async () => {
    const client = clientReturning(respond(409, { errors: ["Задача изменилась на диске"], current: task }));

    const error = (await client.tasks().catch((caught: unknown) => caught)) as ApiError;

    expect(error.status).toBe(409);
    expect(error.current?.id).toBe("SPA-1");
  });

  it("обрыв соединения, шлюз 502–504 и ответ не в JSON — сервер недоступен", async () => {
    const failures = [
      createApiClient(async () => Promise.reject(new TypeError("Failed to fetch"))),
      clientReturning(respond(502, "")),
      clientReturning(respond(503, "")),
      clientReturning(respond(503, {})),
      clientReturning(respond(504, { errors: ["gateway"] })),
      clientReturning(respond(500, "внутренняя ошибка", "text/plain")),
      clientReturning(respond(200, "<!doctype html>", "text/html")),
    ];

    for (const client of failures) {
      const error = await client.tasks().catch((caught: unknown) => caught);
      expect(isServerUnreachable(error)).toBe(true);
    }
  });

  it("ошибка сервера без текста несёт код статуса, а не «не отвечает»", async () => {
    const error = await clientReturning(respond(500, {})).tasks().catch((caught: unknown) => caught);

    expect(isServerUnreachable(error)).toBe(false);
    expect((error as ApiError).status).toBe(500);
  });

  it("503 с текстом ошибки — занятый файл, а не «сервер не отвечает»", async () => {
    const busy = "Файл SPA-1.md занят другим процессом";
    const error = await clientReturning(respond(503, { errors: [busy] })).tasks().catch((caught: unknown) => caught);

    expect(isServerUnreachable(error)).toBe(false);
    expect(error).toMatchObject({ status: 503, errors: [busy] });
  });
});
