import { z, type ZodError, type ZodType } from "zod";

const russianMessages = z.locales.ru().localeError;

type ParsedInRussian<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export function parseInRussian<T>(schema: ZodType<T>, value: unknown): ParsedInRussian<T> {
  const parsed = schema.safeParse(value, { error: russianMessages });
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, errors: formatIssues(parsed.error) };
}

function formatIssues(error: ZodError): string[] {
  return error.issues.map((issue) => (issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message));
}
