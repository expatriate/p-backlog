import { stat } from "node:fs/promises";
import { join } from "node:path";
import { claudeDir, claudeSkillsDir } from "../../core/claude-dir";

export const AGENTS = ["claude", "codex", "cursor"] as const;

export type Agent = (typeof AGENTS)[number];

export const AGENT_LABELS: Record<Agent, string> = { claude: "Claude Code", codex: "Codex", cursor: "Cursor" };

export type AgentDetection = { found: Agent[]; missing: { agent: Agent; dir: string }[] };

export function agentHomeDir(agent: Agent, env: NodeJS.ProcessEnv, home: string): string {
  if (agent === "claude") return claudeDir(env, home);
  if (agent === "codex") return env.CODEX_HOME || join(home, ".codex");
  return join(home, ".cursor");
}

export function agentSkillsDir(agent: Agent, env: NodeJS.ProcessEnv, home: string): string {
  return agent === "claude" ? claudeSkillsDir(env, home) : join(agentHomeDir(agent, env, home), "skills");
}

export async function detectAgents(env: NodeJS.ProcessEnv, home: string): Promise<AgentDetection> {
  const detection: AgentDetection = { found: [], missing: [] };
  for (const agent of AGENTS) {
    const dir = agentHomeDir(agent, env, home);
    const present = agent === "claude" || ((await stat(dir).catch(() => null))?.isDirectory() ?? false);
    if (present) detection.found.push(agent);
    else detection.missing.push({ agent, dir });
  }
  return detection;
}
