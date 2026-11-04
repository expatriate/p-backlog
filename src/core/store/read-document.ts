import { isUtf8 } from "node:buffer";
import type { ParseResult } from "../model/types";
import { readBytesOrNull } from "./fs-utils";

export async function parseDocumentOrNull<T>(path: string, parse: (text: string) => ParseResult<T>): Promise<ParseResult<T> | null> {
  const document = await readDocumentOrNull(path);
  return document?.ok === true ? parse(document.value) : document;
}

export async function readDocumentOrNull(path: string): Promise<ParseResult<string> | null> {
  const bytes = await readBytesOrNull(path);
  if (bytes === null) return null;
  return isUtf8(bytes) ? { ok: true, value: bytes.toString("utf8") } : { ok: false, problems: [{ code: "not-utf8" }] };
}
