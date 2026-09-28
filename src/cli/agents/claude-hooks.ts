import { HOOK_STOP_COMMAND } from "../../core/hook-signature";
import { addGroupedStopHook, commandOfHook, guardedPosixCommand, removeGroupedStopHook, type HookInstallResult, type HookRemoveResult, type IsOurHook } from "./grouped-stop-hooks";

const POSIX_COMMAND = guardedPosixCommand(HOOK_STOP_COMMAND);
const POWERSHELL_COMMAND = "if (Get-Command backlog.cmd -ErrorAction SilentlyContinue) { backlog.cmd hook stop }";
const CURRENT_COMMANDS = [POSIX_COMMAND, POWERSHELL_COMMAND];
const RETIRED_COMMANDS = ["if (Get-Command backlog -ErrorAction SilentlyContinue) { $input | backlog hook stop }"];

type StopHook = { type: "command"; command: string; shell?: "powershell" };

export function claudeStopHookFor(platform: NodeJS.Platform): StopHook {
  return platform === "win32" ? { type: "command", shell: "powershell", command: POWERSHELL_COMMAND } : { type: "command", command: POSIX_COMMAND };
}

function hasCommandOf(commands: readonly string[]): IsOurHook {
  return (hook) => {
    const command = commandOfHook(hook);
    return command !== undefined && commands.includes(command);
  };
}

const isCurrentClaudeStopHook = hasCommandOf(CURRENT_COMMANDS);

export const isOurClaudeStopHook = hasCommandOf([...CURRENT_COMMANDS, ...RETIRED_COMMANDS]);

export function addClaudeStopHook(settingsPath: string, platform: NodeJS.Platform): Promise<HookInstallResult> {
  return addGroupedStopHook(settingsPath, claudeStopHookFor(platform), { isOurs: isOurClaudeStopHook, isCurrent: isCurrentClaudeStopHook });
}

export function removeClaudeStopHook(settingsPath: string): Promise<HookRemoveResult> {
  return removeGroupedStopHook(settingsPath, isOurClaudeStopHook);
}
