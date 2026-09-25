export const AGENTS = ["claude", "codex", "cursor"] as const;

export type Agent = (typeof AGENTS)[number];
