import type { MiddlewareHandler } from "hono";
import { serverLanguage, serverMessages } from "./messages";

const MUTATING_METHODS: ReadonlySet<string> = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export function localHosts(port: number): ReadonlySet<string> {
  return new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
}

export function allowLocalHostsOnly(allowedHosts: ReadonlySet<string>, root: string): MiddlewareHandler {
  return async (c, next) => {
    const { host } = new URL(c.req.url);
    if (!allowedHosts.has(host)) {
      const messages = serverMessages(await serverLanguage(root));
      return c.json({ errors: [messages.hostRejected(host)] }, 403);
    }
    await next();
    return undefined;
  };
}

export function requireJsonBody(root: string): MiddlewareHandler {
  return async (c, next) => {
    if (MUTATING_METHODS.has(c.req.method) && !c.req.header("content-type")?.startsWith("application/json")) {
      const messages = serverMessages(await serverLanguage(root));
      return c.json({ errors: [messages.jsonContentTypeExpected] }, 415);
    }
    await next();
    return undefined;
  };
}
