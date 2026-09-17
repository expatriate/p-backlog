import { z, type ZodError } from "zod";

z.config(z.locales.ru());

export function formatIssues(error: ZodError): string[] {
  return error.issues.map((issue) => (issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message));
}
