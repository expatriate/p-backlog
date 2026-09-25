import { join } from "node:path";
import { claudeDir, claudeSkillsDir } from "../../core/claude-dir";

export const AGENTS = ["claude", "codex", "cursor"] as const;

export type Agent = (typeof AGENTS)[number];

export function agentHomeDir(agent: Agent, env: NodeJS.ProcessEnv, home: string): string {
  if (agent === "claude") return claudeDir(env, home);
  if (agent === "codex") return env.CODEX_HOME || join(home, ".codex");
  return join(home, ".cursor");
}

export function agentSkillsDir(agent: Agent, env: NodeJS.ProcessEnv, home: string): string {
  return agent === "claude" ? claudeSkillsDir(env, home) : join(agentHomeDir(agent, env, home), "skills");
}
