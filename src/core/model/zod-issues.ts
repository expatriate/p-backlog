import { z, type ZodType } from "zod";
import { CODED_SCHEMA_ISSUES, type SchemaIssue, type SchemaProblem } from "./problems";

type SchemaParsed<T> = { ok: true; value: T } | { ok: false; problems: SchemaProblem[] };

export function parseSchema<T>(schema: ZodType<T>, value: unknown): SchemaParsed<T> {
  const parsed = schema.safeParse(value, { reportInput: true });
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, problems: parsed.error.issues.map(schemaProblem) };
}

function schemaProblem(issue: z.core.$ZodIssue): SchemaProblem {
  return { code: "schema", path: issue.path.join("."), issue: schemaIssue(issue) };
}

function schemaIssue({ input, ...issue }: z.core.$ZodIssue): SchemaIssue {
  const coded = CODED_SCHEMA_ISSUES.find((kind) => kind === issue.message);
  if (coded !== undefined) return { kind: coded };
  return issue.code === "invalid_type" ? { kind: "zod", issue, receivedType: z.core.util.parsedType(input) } : { kind: "zod", issue };
}
