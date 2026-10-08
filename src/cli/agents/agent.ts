import { join } from "node:path";
import { claudeDir, claudeSettingsPath, claudeSkillsDir } from "../../core/claude-dir";
import type { PathErrorHandler } from "../../core/errors";
import { readReportingFailure, statOrNull } from "../../core/store/fs-utils";

export const AGENTS = ["claude", "codex", "cursor"] as const;

export type Agent = (typeof AGENTS)[number];

export type AgentPlaces = { env: NodeJS.ProcessEnv; home: string };

type PlacePath = (places: AgentPlaces) => string;

type StopProtocol = "claude" | "cursor";

type AgentSpec = {
  label: string;
  stopProtocol: StopProtocol;
  homeDir: PlacePath;
  skillsDir: PlacePath;
  legacySkillsDirs: (places: AgentPlaces) => string[];
  hookConfigPath: PlacePath;
  pluginSettingsPath: PlacePath | null;
  alwaysInstalled: boolean;
  skillOnLanguageChange: "link" | "relinkExisting";
  hookApprovalCommand: string | null;
};

const AGENT_HOOKS_FILE = "hooks.json";

const claudeSettings: PlacePath = ({ env, home }) => claudeSettingsPath(env, home);

type HooksJsonTraits = Pick<AgentSpec, "stopProtocol" | "hookApprovalCommand">;

function hooksJsonAgent(label: string, homeDir: PlacePath, { stopProtocol, hookApprovalCommand }: HooksJsonTraits): AgentSpec {
  return {
    label,
    stopProtocol,
    homeDir,
    skillsDir: ({ home }) => join(home, ".agents", "skills"),
    legacySkillsDirs: (places) => [join(homeDir(places), "skills")],
    hookConfigPath: (places) => join(homeDir(places), AGENT_HOOKS_FILE),
    pluginSettingsPath: null,
    alwaysInstalled: false,
    skillOnLanguageChange: "relinkExisting",
    hookApprovalCommand,
  };
}

export const AGENT_SPECS: Record<Agent, AgentSpec> = {
  claude: {
    label: "Claude Code",
    stopProtocol: "claude",
    homeDir: ({ env, home }) => claudeDir(env, home),
    skillsDir: ({ env, home }) => claudeSkillsDir(env, home),
    legacySkillsDirs: () => [],
    hookConfigPath: claudeSettings,
    pluginSettingsPath: claudeSettings,
    alwaysInstalled: true,
    skillOnLanguageChange: "link",
    hookApprovalCommand: null,
  },
  codex: hooksJsonAgent("Codex", ({ env, home }) => env.CODEX_HOME || join(home, ".codex"), { stopProtocol: "claude", hookApprovalCommand: "/hooks" }),
  cursor: hooksJsonAgent("Cursor", ({ home }) => join(home, ".cursor"), { stopProtocol: "cursor", hookApprovalCommand: null }),
};

export type AgentVoice = { print: (line: string) => void; warn: (line: string) => void };

export function agentVoice(agent: Agent, output: AgentVoice): AgentVoice {
  const { label } = AGENT_SPECS[agent];
  return { print: (line) => output.print(`${label}: ${line}`), warn: (line) => output.warn(`${label}: ${line}`) };
}

export type AgentDetection = { found: Agent[]; missing: { agent: Agent; dir: string }[] };

export async function detectAgents(places: AgentPlaces, onUnreadable: PathErrorHandler): Promise<AgentDetection> {
  const detection: AgentDetection = { found: [], missing: [] };
  for (const agent of AGENTS) {
    const spec = AGENT_SPECS[agent];
    const dir = spec.homeDir(places);
    const present = spec.alwaysInstalled || (await readReportingFailure(dir, isDirectory, onUnreadable));
    if (present === true) detection.found.push(agent);
    else if (present === false) detection.missing.push({ agent, dir });
  }
  return detection;
}

async function isDirectory(path: string): Promise<boolean> {
  return (await statOrNull(path))?.isDirectory() ?? false;
}
