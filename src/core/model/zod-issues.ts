import { z, type ZodError, type ZodType } from "zod";

const russianMessages = z.locales.ru().localeError;

type ParsedInRussian<T> = { ok: true; value: T } | { ok: false; errors: string[] };

type Issue = ZodError["issues"][number];

type IssueText = (issue: Issue) => string;

const issueWithPath: IssueText = (issue) => (issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message);

export const issueWithoutPath: IssueText = (issue) => issue.message;

export function parseInRussian<T>(schema: ZodType<T>, value: unknown, issueText: IssueText = issueWithPath): ParsedInRussian<T> {
  const parsed = schema.safeParse(value, { error: russianMessages });
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, errors: [...new Set(parsed.error.issues.map(issueText))] };
}
