import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { ZodType } from "zod";
import { updateTaskRequestSchema } from "../core/api/contract";
import { formatIssues } from "../core/model/zod-issues";
import { loadBacklog } from "../core/store/load";
import { updateTask } from "../core/store/update";
import type { Invalid } from "../core/store/write-result";
import type { ChangeFeed } from "./change-feed";

export type ApiOptions = { root: string; changes: ChangeFeed };

export function createApi({ root, changes }: ApiOptions): Hono {
  const api = new Hono();

  api.get("/projects", async (c) => c.json((await loadBacklog(root)).projects));

  api.get("/tasks", async (c) => {
    const { tasks, errors } = await loadBacklog(root);
    return c.json({ tasks, errors });
  });

  api.patch("/tasks/:id", async (c) => {
    const body = await readBody(c, updateTaskRequestSchema);
    if (!body.ok) return body.response;

    const id = c.req.param("id");
    const result = await updateTask(root, { id, changes: body.data.changes, expectedVersion: body.data.version });
    if (result.ok) return c.json(result.task);
    if (result.reason === "not-found") return c.json({ errors: [`Задача ${id} не найдена`] }, 404);
    if (result.reason === "conflict") return c.json({ errors: ["Задача изменилась на диске"], current: result.current }, 409);
    return invalidResponse(c, result);
  });

  api.get("/events", (c) =>
    streamSSE(c, async (stream) => {
      const unsubscribe = changes.subscribe(() => void stream.writeSSE({ event: "change", data: "" }));
      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          unsubscribe();
          resolve();
        });
      });
    }),
  );

  return api;
}

function invalidResponse(c: Context, result: Invalid) {
  return c.json({ errors: result.errors }, 422);
}

type ParsedBody<T> = { ok: true; data: T } | { ok: false; response: Response };

async function readBody<T>(c: Context, schema: ZodType<T>): Promise<ParsedBody<T>> {
  const parsed = schema.safeParse(await readJson(c));
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, response: c.json({ errors: formatIssues(parsed.error) }, 422) };
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}
