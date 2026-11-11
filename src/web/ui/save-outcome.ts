export type SaveOutcome = { kind: "saved" } | { kind: "failed" } | { kind: "fieldError"; message: string };
