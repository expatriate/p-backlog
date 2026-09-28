import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ErrorResponse } from "../core/api/contract";
import type { Language } from "../core/i18n/language";
import { coreMessages } from "../core/messages";
import type { FileBusyError } from "../core/store/file-lock";

type BusyFile = Pick<FileBusyError, "path" | "lock" | "seconds">;

export function errorResponse(c: Context, status: ContentfulStatusCode, ...errors: string[]): Response {
  const body: ErrorResponse = { errors };
  return c.json(body, status);
}

export function fileBusyResponse(c: Context, language: Language, { path, lock, seconds }: BusyFile): Response {
  return errorResponse(c, 503, coreMessages(language).fileBusy(path, lock, seconds));
}
