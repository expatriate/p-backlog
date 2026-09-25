import { HOOK_STOP_COMMAND } from "../core/stats/cost/hook-signature";
import { addGroupedStopHook, removeGroupedStopHook, type HookInstallResult, type HookRemoveResult } from "./agents/grouped-stop-hooks";

const POSIX_COMMAND = guardedPosixCommand(HOOK_STOP_COMMAND);
const POWERSHELL_COMMAND = "if (Get-Command backlog.cmd -ErrorAction SilentlyContinue) { backlog.cmd hook stop }";

type StopHook = { type: "command"; command: string; shell?: "powershell" };

export function stopHookFor(platform: NodeJS.Platform): StopHook {
  return platform === "win32" ? { type: "command", shell: "powershell", command: POWERSHELL_COMMAND } : { type: "command", command: POSIX_COMMAND };
}

export function guardedPosixCommand(backlogArgs: string): string {
  return `command -v backlog >/dev/null && backlog ${backlogArgs} || true`;
}

export function hookCommand(hook: unknown): string | undefined {
  const command = typeof hook === "object" && hook !== null ? (hook as { command?: unknown }).command : undefined;
  return typeof command === "string" ? command : undefined;
}

export function isOurStopHook(hook: unknown): boolean {
  const command = hookCommand(hook);
  return command === POSIX_COMMAND || command === POWERSHELL_COMMAND;
}

export function addStopHook(settingsPath: string, platform: NodeJS.Platform): Promise<HookInstallResult> {
  return addGroupedStopHook(settingsPath, stopHookFor(platform), { isOurs: isOurStopHook, isCurrent: isOurStopHook });
}

export function removeStopHook(settingsPath: string): Promise<HookRemoveResult> {
  return removeGroupedStopHook(settingsPath, isOurStopHook);
}
