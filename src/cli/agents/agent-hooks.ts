import { warnPathErrors } from "../../core/errors";
import { HOOK_STOP_COMMAND } from "../../core/hook-signature";
import type { CliIo } from "../io";
import { AGENT_SPECS, type Agent, type AgentPlaces } from "./agent";
import { addClaudeStopHook, removeClaudeStopHook } from "./claude-hooks";
import { addCursorStopHook, removeCursorStopHook } from "./cursor-hooks";
import type { ConfigFile } from "./json-config";
import { addGroupedStopHook, commandOfHook, guardedPosixCommand, removeGroupedStopHook, type HookInstallResult, type HookRemoveResult, type IsOurHook, type OurHook } from "./grouped-stop-hooks";

type HookFileSite = AgentPlaces & Pick<CliIo, "warn">;

type HookSite = HookFileSite & Pick<CliIo, "platform" | "cliPath">;

type StopHookFile = {
  install: (agent: Agent, file: ConfigFile, site: HookSite) => Promise<HookInstallResult>;
  remove: (agent: Agent, file: ConfigFile) => Promise<HookRemoveResult>;
};

const CODEX_HOOK_TIMEOUT_SECONDS = 30;

const STOP_HOOK_FILES: Record<Agent, StopHookFile> = {
  claude: {
    install: (_agent, file, site) => addClaudeStopHook(file, site.platform),
    remove: (_agent, file) => removeClaudeStopHook(file),
  },
  codex: {
    install: (agent, file, site) => {
      const hook = { type: "command", command: posixCommand(agent), commandWindows: windowsCommand(agent, site.cliPath), timeout: CODEX_HOOK_TIMEOUT_SECONDS };
      return addGroupedStopHook(file, hook, ourCurrentHook(agent, hook));
    },
    remove: (agent, file) => removeGroupedStopHook(file, ourHookOf(agent)),
  },
  cursor: {
    install: (agent, file, site) => {
      const hook = { command: site.platform === "win32" ? windowsCommand(agent, site.cliPath) : posixCommand(agent) };
      return addCursorStopHook(file, hook, ourCurrentHook(agent, hook));
    },
    remove: (agent, file) => removeCursorStopHook(file, ourHookOf(agent)),
  },
};

export function installAgentHook(agent: Agent, site: HookSite): Promise<HookInstallResult> {
  return STOP_HOOK_FILES[agent].install(agent, hookConfigFile(agent, site), site);
}

export function removeAgentHook(agent: Agent, site: HookFileSite): Promise<HookRemoveResult> {
  return STOP_HOOK_FILES[agent].remove(agent, hookConfigFile(agent, site));
}

function hookConfigFile(agent: Agent, site: HookFileSite): ConfigFile {
  return { path: AGENT_SPECS[agent].hookConfigPath(site), onError: warnPathErrors(site.warn) };
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
