import { HOOK_STOP_COMMAND } from "../../core/hook-signature";
import type { CliIo } from "../io";
import { AGENT_SPECS, type Agent, type AgentPlaces } from "./agent";
import { addClaudeStopHook, removeClaudeStopHook } from "./claude-hooks";
import { addCursorStopHook, removeCursorStopHook } from "./cursor-hooks";
import { addGroupedStopHook, commandOfHook, guardedPosixCommand, removeGroupedStopHook, type HookInstallResult, type HookRemoveResult, type IsOurHook, type OurHook } from "./grouped-stop-hooks";

type HookSite = AgentPlaces & Pick<CliIo, "platform" | "cliPath">;

type StopHookFile = {
  install: (agent: Agent, path: string, site: HookSite) => Promise<HookInstallResult>;
  remove: (agent: Agent, path: string) => Promise<HookRemoveResult>;
};

const CODEX_HOOK_TIMEOUT_SECONDS = 30;

const STOP_HOOK_FILES: Record<Agent, StopHookFile> = {
  claude: {
    install: (_agent, path, site) => addClaudeStopHook(path, site.platform),
    remove: (_agent, path) => removeClaudeStopHook(path),
  },
  codex: {
    install: (agent, path, site) => {
      const hook = { type: "command", command: posixCommand(agent), commandWindows: windowsCommand(agent, site.cliPath), timeout: CODEX_HOOK_TIMEOUT_SECONDS };
      return addGroupedStopHook(path, hook, ourCurrentHook(agent, hook));
    },
    remove: (agent, path) => removeGroupedStopHook(path, ourHookOf(agent)),
  },
  cursor: {
    install: (agent, path, site) => {
      const hook = { command: site.platform === "win32" ? windowsCommand(agent, site.cliPath) : posixCommand(agent) };
      return addCursorStopHook(path, hook, ourCurrentHook(agent, hook));
    },
    remove: (agent, path) => removeCursorStopHook(path, ourHookOf(agent)),
  },
};

export function installAgentHook(agent: Agent, site: HookSite): Promise<HookInstallResult> {
  return STOP_HOOK_FILES[agent].install(agent, AGENT_SPECS[agent].hookConfigPath(site), site);
}

export function removeAgentHook(agent: Agent, site: AgentPlaces): Promise<HookRemoveResult> {
  return STOP_HOOK_FILES[agent].remove(agent, AGENT_SPECS[agent].hookConfigPath(site));
}

function agentStopCommand(agent: Agent): string {
  return `${HOOK_STOP_COMMAND} --agent ${agent}`;
}

function posixCommand(agent: Agent): string {
  return guardedPosixCommand(agentStopCommand(agent));
}

function windowsCommand(agent: Agent, cliPath: string): string {
  return `node "${cliPath}" ${agentStopCommand(agent)}`;
}

function windowsCommandPattern(agent: Agent): RegExp {
  return new RegExp(`^node "[^"]+" ${agentStopCommand(agent)}$`);
}

function ourHookOf(agent: Agent): IsOurHook {
  return (hook) => {
    const command = commandOfHook(hook);
    if (command === undefined) return false;
    return command === posixCommand(agent) || windowsCommandPattern(agent).test(command);
  };
}

function ourCurrentHook(agent: Agent, wanted: Record<string, unknown>): OurHook {
  return {
    isOurs: ourHookOf(agent),
    isCurrent: (hook) => Object.entries(wanted).every(([key, value]) => (hook as Record<string, unknown>)[key] === value),
  };
}
