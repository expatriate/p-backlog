import { HOOK_STOP_COMMAND } from "../core/hook-signature";
import { addGroupedStopHook, removeGroupedStopHook, type HookInstallResult, type HookRemoveResult, type IsOurHook } from "./agents/grouped-stop-hooks";

const POSIX_COMMAND = guardedPosixCommand(HOOK_STOP_COMMAND);
const POWERSHELL_COMMAND = "if (Get-Command backlog.cmd -ErrorAction SilentlyContinue) { backlog.cmd hook stop }";
const CURRENT_COMMANDS = [POSIX_COMMAND, POWERSHELL_COMMAND];
const RETIRED_COMMANDS = ["if (Get-Command backlog -ErrorAction SilentlyContinue) { $input | backlog hook stop }"];

type StopHook = { type: "command"; command: string; shell?: "powershell" };

export function stopHookFor(platform: NodeJS.Platform): StopHook {
  return platform === "win32" ? { type: "command", shell: "powershell", command: POWERSHELL_COMMAND } : { type: "command", command: POSIX_COMMAND };
}

export function guardedPosixCommand(backlogArgs: string): string {
  return `command -v backlog >/dev/null && backlog ${backlogArgs} || true`;
}

export function commandOfHook(hook: unknown): string | undefined {
  const command = typeof hook === "object" && hook !== null ? (hook as { command?: unknown }).command : undefined;
  return typeof command === "string" ? command : undefined;
}

function hasCommandOf(commands: readonly string[]): IsOurHook {
  return (hook) => {
    const command = commandOfHook(hook);
    return command !== undefined && commands.includes(command);
  };
}

const isCurrentStopHook = hasCommandOf(CURRENT_COMMANDS);

export const isOurStopHook = hasCommandOf([...CURRENT_COMMANDS, ...RETIRED_COMMANDS]);

export function addStopHook(settingsPath: string, platform: NodeJS.Platform): Promise<HookInstallResult> {
  return addGroupedStopHook(settingsPath, stopHookFor(platform), { isOurs: isOurStopHook, isCurrent: isCurrentStopHook });
}

export function removeStopHook(settingsPath: string): Promise<HookRemoveResult> {
  return removeGroupedStopHook(settingsPath, isOurStopHook);
}
