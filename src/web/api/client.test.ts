import { describe, expect, it } from "vitest";
import type { Task } from "../../core/model/types";
import { ApiError, createApiClient } from "./client";

function respond(status: number, body: unknown, contentType = "application/json"): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new Response(text, { status, headers: { "content-type": contentType } });
}

function clientReturning(response: Response) {
  return createApiClient(async () => response);
}

const task = { id: "SPA-1", title: "Задача" } as Task;

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

  it("не падает на ответе, который не является JSON", async () => {
    const client = clientReturning(respond(500, "внутренняя ошибка", "text/plain"));

    const error = (await client.tasks().catch((caught: unknown) => caught)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.errors).toEqual(["Ошибка 500"]);
  });
});
