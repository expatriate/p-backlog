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
    const client = clientReturning(respond(422, { errors: ["SPA-1 не является эпиком"] }));

    const error = await client.tasks().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, errors: ["SPA-1 не является эпиком"] });
    expect((error as ApiError).message).toContain("SPA-1 не является эпиком");
  });

  it("несёт актуальную задачу из конфликта версий", async () => {
    const client = clientReturning(respond(409, { errors: ["Задача изменилась на диске"], current: task }));

    const error = (await client.tasks().catch((caught: unknown) => caught)) as ApiError;

    expect(error.status).toBe(409);
    expect(error.current?.id).toBe("SPA-1");
  });

  it("несёт созданный эпик, если привязать удалось не все задачи", async () => {
    const client = clientReturning(respond(409, { errors: ["Эпик SPA-5 создан, но привязать удалось не все задачи"], epic: task }));

    const error = (await client.tasks().catch((caught: unknown) => caught)) as ApiError;

    expect(error.epic?.id).toBe("SPA-1");
  });

  it("не падает на ответе, который не является JSON", async () => {
    const client = clientReturning(respond(500, "внутренняя ошибка", "text/plain"));

    const error = (await client.tasks().catch((caught: unknown) => caught)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.errors).toEqual(["Ошибка 500"]);
  });
});
