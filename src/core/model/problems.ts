import type { z } from "zod";

export const CODED_SCHEMA_ISSUES = ["bad-id", "empty-title", "empty-name", "bad-prefix"] as const;
type CodedSchemaIssue = (typeof CODED_SCHEMA_ISSUES)[number];

export type StoredZodIssue = { issue: Omit<z.core.$ZodIssue, "input">; receivedType?: string };

export type SchemaIssue = { kind: CodedSchemaIssue } | ({ kind: "zod" } & StoredZodIssue);

export type Problem =
  | { code: "self-block" }
  | { code: "self-related" }
  | { code: "referenced-as-epic"; children: readonly string[] }
  | { code: "blocker-cycle"; cycle: readonly string[] }
  | { code: "resolution-needs-status"; resolution: string; status: string }
  | { code: "reason-without-resolution" }
  | { code: "epic-self" }
  | { code: "epic-missing"; epic: string }
  | { code: "epic-not-epic"; epic: string }
  | { code: "epic-foreign-project"; epic: string }
  | { code: "epic-in-epic" }
  | { code: "reference-missing"; id: string }
  | { code: "no-frontmatter" }
  | { code: "frontmatter-unclosed" }
  | { code: "yaml"; detail: string }
  | { code: "schema"; path: string; issue: SchemaIssue }
  | { code: "id-mismatch"; id: string; file: string }
  | { code: "prefix-mismatch"; file: string; prefix: string }
  | { code: "id-exhausted"; attempts: number };

export type SchemaProblem = Extract<Problem, { code: "schema" }>;

export function schemaCode(kind: CodedSchemaIssue): { error: () => CodedSchemaIssue } {
  return { error: () => kind };
}
