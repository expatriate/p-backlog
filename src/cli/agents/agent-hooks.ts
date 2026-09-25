import { join } from "node:path";
import { claudeSettingsPath } from "../../core/claude-dir";
import { HOOK_STOP_COMMAND } from "../../core/stats/cost/hook-signature";
import type { CliIo } from "../io";
import { addStopHook, guardedPosixCommand, hookCommand, removeStopHook } from "../stop-hook";
import { agentHomeDir, type Agent, type AgentPlaces } from "./agent";
import { addCursorStopHook, removeCursorStopHook } from "./cursor-hooks";
import { addGroupedStopHook, removeGroupedStopHook, type HookInstallResult, type HookRemoveResult, type IsOurHook, type OurHook } from "./grouped-stop-hooks";

type HookSite = AgentPlaces & Pick<CliIo, "platform" | "cliPath">;

const CODEX_HOOK_TIMEOUT_SECONDS = 30;
const AGENT_HOOKS_FILE = "hooks.json";

export function agentHookConfigPath(agent: Agent, places: AgentPlaces): string {
  return agent === "claude" ? claudeSettingsPath(places.env, places.home) : join(agentHomeDir(agent, places), AGENT_HOOKS_FILE);
}

export function installAgentHook(agent: Agent, site: HookSite): Promise<HookInstallResult> {
  const path = agentHookConfigPath(agent, site);
  switch (agent) {
    case "claude":
      return addStopHook(path, site.platform);
    case "codex": {
      const hook = { type: "command", command: posixCommand(agent), commandWindows: windowsCommand(agent, site.cliPath), timeout: CODEX_HOOK_TIMEOUT_SECONDS };
      return addGroupedStopHook(path, hook, ourCurrentHook(agent, site.cliPath, hook));
    }
    case "cursor": {
      const hook = { command: site.platform === "win32" ? windowsCommand(agent, site.cliPath) : posixCommand(agent) };
      return addCursorStopHook(path, hook, ourCurrentHook(agent, site.cliPath, hook));
    }
  }
}

export function removeAgentHook(agent: Agent, site: AgentPlaces): Promise<HookRemoveResult> {
  const path = agentHookConfigPath(agent, site);
  switch (agent) {
    case "claude":
      return removeStopHook(path);
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
  return new RegExp(`^node "[^"]*cli\\.js" ${agentStopCommand(agent)}$`);
}

function ourHookOf(agent: Agent, cliPath?: string): IsOurHook {
  return (hook) => {
    const command = hookCommand(hook);
    if (command === undefined) return false;
    return command === posixCommand(agent) || (cliPath !== undefined && command === windowsCommand(agent, cliPath)) || windowsCommandPattern(agent).test(command);
  };
}

function ourCurrentHook(agent: Agent, cliPath: string, wanted: Record<string, unknown>): OurHook {
  return {
    isOurs: ourHookOf(agent, cliPath),
    isCurrent: (hook) => Object.entries(wanted).every(([key, value]) => (hook as Record<string, unknown>)[key] === value),
  };
}
