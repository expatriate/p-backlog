import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ErrorResponse } from "../core/api/contract";
import type { Language } from "../core/i18n/language";
import { coreMessages } from "../core/messages";
import type { LockBusy } from "../core/store/file-lock";

export type Refused = { ok: false; response: Response };

export function errorResponse(c: Context, status: ContentfulStatusCode, ...errors: string[]): Response {
  const body: ErrorResponse = { errors };
  return c.json(body, status);
}

export function fileBusyResponse(c: Context, language: Language, busy: LockBusy): Response {
  return errorResponse(c, 503, coreMessages(language).fileBusy(busy));
}
