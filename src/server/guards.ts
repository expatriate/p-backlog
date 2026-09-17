import type { MiddlewareHandler } from "hono";

const MUTATING_METHODS: ReadonlySet<string> = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export function localHosts(port: number): ReadonlySet<string> {
  return new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
}

export function allowLocalHostsOnly(allowedHosts: ReadonlySet<string>): MiddlewareHandler {
  return async (c, next) => {
    const { host } = new URL(c.req.url);
    if (!allowedHosts.has(host)) return c.json({ errors: [`Запросы с хоста ${host} не принимаются`] }, 403);
    await next();
  };
}

export const requireJsonBody: MiddlewareHandler = async (c, next) => {
  if (MUTATING_METHODS.has(c.req.method) && !c.req.header("content-type")?.startsWith("application/json")) {
    return c.json({ errors: ["Ожидается Content-Type: application/json"] }, 415);
  }
  await next();
};
