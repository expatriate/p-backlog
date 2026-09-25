import { stat } from "node:fs/promises";
import { join } from "node:path";
import { claudeDir, claudeSkillsDir } from "../../core/claude-dir";

export const AGENTS = ["claude", "codex", "cursor"] as const;

export type Agent = (typeof AGENTS)[number];

export type AgentPlaces = { env: NodeJS.ProcessEnv; home: string };

export const AGENT_LABELS: Record<Agent, string> = { claude: "Claude Code", codex: "Codex", cursor: "Cursor" };

export type AgentDetection = { found: Agent[]; missing: { agent: Agent; dir: string }[] };

export function agentHomeDir(agent: Agent, { env, home }: AgentPlaces): string {
  if (agent === "claude") return claudeDir(env, home);
  if (agent === "codex") return env.CODEX_HOME || join(home, ".codex");
  return join(home, ".cursor");
}

export function agentSkillsDir(agent: Agent, places: AgentPlaces): string {
  return agent === "claude" ? claudeSkillsDir(places.env, places.home) : join(places.home, ".agents", "skills");
}

export function legacySkillsDirs(agent: Agent, places: AgentPlaces): string[] {
  return agent === "claude" ? [] : [join(agentHomeDir(agent, places), "skills")];
}

export async function detectAgents(places: AgentPlaces): Promise<AgentDetection> {
  const detection: AgentDetection = { found: [], missing: [] };
  for (const agent of AGENTS) {
    const dir = agentHomeDir(agent, places);
    const present = agent === "claude" || ((await stat(dir).catch(() => null))?.isDirectory() ?? false);
    if (present) detection.found.push(agent);
    else detection.missing.push({ agent, dir });
  }
  return detection;
}
