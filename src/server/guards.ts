import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Language } from "../core/i18n/language";
import { errorResponse } from "./error-response";
import { serverMessages } from "./messages";

const BYTES_PER_MEBIBYTE = 1024 * 1024;
const REQUEST_BODY_LIMIT_MEBIBYTES = 1;

const MUTATING_METHODS: ReadonlySet<string> = new Set(["POST", "PATCH", "PUT", "DELETE"]);

export function localHosts(port: number): ReadonlySet<string> {
  return new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
}

export function allowLocalHostsOnly(allowedHosts: ReadonlySet<string>, readLanguage: () => Promise<Language>): MiddlewareHandler {
  return async (c, next) => {
    const { host } = new URL(c.req.url);
    if (!allowedHosts.has(host)) {
      const messages = serverMessages(await readLanguage());
      return errorResponse(c, 403, messages.hostRejected(host));
    }
    await next();
    return undefined;
  };
}

export function requireJsonBody(readLanguage: () => Promise<Language>): MiddlewareHandler {
  return async (c, next) => {
    if (MUTATING_METHODS.has(c.req.method) && !c.req.header("content-type")?.startsWith("application/json")) {
      const messages = serverMessages(await readLanguage());
      return errorResponse(c, 415, messages.jsonContentTypeExpected);
    }
    await next();
    return undefined;
  };
}

export function limitRequestBody(readLanguage: () => Promise<Language>): MiddlewareHandler {
  return bodyLimit({
    maxSize: REQUEST_BODY_LIMIT_MEBIBYTES * BYTES_PER_MEBIBYTE,
    onError: async (c) => errorResponse(c, 413, serverMessages(await readLanguage()).bodyTooLarge(REQUEST_BODY_LIMIT_MEBIBYTES)),
  });
}
