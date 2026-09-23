import { z } from "zod";
import { describe, expect, it } from "vitest";
import { zodIssueText } from "./zod";

const schema = z.object({ value: z.string() });
const localeError = z.locales.ru().localeError;

function invalidTypeIssue(value: unknown): z.core.$ZodIssue {
  const result = schema.safeParse({ value }, { reportInput: true });
  if (result.success) throw new Error("expected an invalid_type issue");
  const issue = result.error.issues[0];
  if (issue === undefined) throw new Error("expected an invalid_type issue");
  return issue;
}

function realMessage(issue: z.core.$ZodIssue): string {
  const text = localeError(issue as z.core.$ZodRawIssue);
  return typeof text === "string" ? text : (text?.message ?? issue.message);
}

describe("zodIssueText", () => {
  it.each([
    ["Date", new Date()],
    ["plain object", { a: 1 }],
  ])("для входа типа %s текст совпадает с тем, что дал бы zod с настоящим значением", (_label, value) => {
    const issue = invalidTypeIssue(value);
    const { input, ...withoutInput } = issue;
    const receivedType = z.core.util.parsedType(input);

    expect(zodIssueText(localeError, { issue: withoutInput, receivedType })).toBe(realMessage(issue));
  });
});
