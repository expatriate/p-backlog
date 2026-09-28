import { HOOK_STOP_COMMAND } from "../../core/hook-signature";
import type { CliIo } from "../io";
import { AGENT_SPECS, type Agent, type AgentPlaces } from "./agent";
import { addClaudeStopHook, removeClaudeStopHook } from "./claude-hooks";
import { addCursorStopHook, removeCursorStopHook } from "./cursor-hooks";
import { addGroupedStopHook, commandOfHook, guardedPosixCommand, removeGroupedStopHook, type HookInstallResult, type HookRemoveResult, type IsOurHook, type OurHook } from "./grouped-stop-hooks";

type HookSite = AgentPlaces & Pick<CliIo, "platform" | "cliPath">;

const CODEX_HOOK_TIMEOUT_SECONDS = 30;

export function installAgentHook(agent: Agent, site: HookSite): Promise<HookInstallResult> {
  const path = AGENT_SPECS[agent].hookConfigPath(site);
  switch (agent) {
    case "claude":
      return addClaudeStopHook(path, site.platform);
    case "codex": {
      const hook = { type: "command", command: posixCommand(agent), commandWindows: windowsCommand(agent, site.cliPath), timeout: CODEX_HOOK_TIMEOUT_SECONDS };
      return addGroupedStopHook(path, hook, ourCurrentHook(agent, hook));
    }
    case "cursor": {
      const hook = { command: site.platform === "win32" ? windowsCommand(agent, site.cliPath) : posixCommand(agent) };
      return addCursorStopHook(path, hook, ourCurrentHook(agent, hook));
    }
  }
}

export function removeAgentHook(agent: Agent, site: AgentPlaces): Promise<HookRemoveResult> {
  const path = AGENT_SPECS[agent].hookConfigPath(site);
  switch (agent) {
    case "claude":
      return removeClaudeStopHook(path);
    case "codex":
      return removeGroupedStopHook(path, ourHookOf(agent));
    case "cursor":
      return removeCursorStopHook(path, ourHookOf(agent));
  }
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
