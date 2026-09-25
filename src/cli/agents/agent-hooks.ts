import { join } from "node:path";
import { claudeSettingsPath } from "../../core/claude-dir";
import { HOOK_STOP_COMMAND } from "../../core/stats/cost/hook-signature";
import type { CliIo } from "../io";
import { addStopHook, removeStopHook } from "../stop-hook";
import { agentHomeDir, type Agent } from "./agent";
import { addCursorStopHook, removeCursorStopHook } from "./cursor-hooks";
import { addGroupedStopHook, removeGroupedStopHook, type HookInstallResult, type HookRemoveResult, type IsOurHook } from "./grouped-stop-hooks";

type HookSite = Pick<CliIo, "env" | "home" | "platform" | "cliPath">;

const CODEX_HOOK_TIMEOUT_SECONDS = 30;
const AGENT_HOOKS_FILE = "hooks.json";

export function agentHookConfigPath(agent: Agent, env: NodeJS.ProcessEnv, home: string): string {
  return agent === "claude" ? claudeSettingsPath(env, home) : join(agentHomeDir(agent, env, home), AGENT_HOOKS_FILE);
}

export function installAgentHook(agent: Agent, site: HookSite): Promise<HookInstallResult> {
  const path = agentHookConfigPath(agent, site.env, site.home);
  switch (agent) {
    case "claude":
      return addStopHook(path, site.platform);
    case "codex":
      return addGroupedStopHook(
        path,
        { type: "command", command: posixCommand(agent), commandWindows: windowsCommand(agent, site.cliPath), timeout: CODEX_HOOK_TIMEOUT_SECONDS },
        ourHookOf(agent),
      );
    case "cursor":
      return addCursorStopHook(path, { command: site.platform === "win32" ? windowsCommand(agent, site.cliPath) : posixCommand(agent) }, ourHookOf(agent));
  }
}

export function removeAgentHook(agent: Agent, site: Pick<HookSite, "env" | "home">): Promise<HookRemoveResult> {
  const path = agentHookConfigPath(agent, site.env, site.home);
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
  return `command -v backlog >/dev/null && backlog ${agentStopCommand(agent)} || true`;
}

function windowsCommand(agent: Agent, cliPath: string): string {
  return `node "${cliPath}" ${agentStopCommand(agent)}`;
}

function ourHookOf(agent: Agent): IsOurHook {
  return (hook) => {
    const command = typeof hook === "object" && hook !== null ? (hook as { command?: unknown }).command : undefined;
    return typeof command === "string" && command.includes(agentStopCommand(agent));
  };
}
