import { addGroupedStopHook, removeGroupedStopHook, type HookInstallResult, type HookRemoveResult } from "./agents/grouped-stop-hooks";

const POSIX_COMMAND = "command -v backlog >/dev/null && backlog hook stop || true";
const POWERSHELL_COMMAND = "if (Get-Command backlog.cmd -ErrorAction SilentlyContinue) { backlog.cmd hook stop }";

type StopHook = { type: "command"; command: string; shell?: "powershell" };

export function stopHookFor(platform: NodeJS.Platform): StopHook {
  return platform === "win32" ? { type: "command", shell: "powershell", command: POWERSHELL_COMMAND } : { type: "command", command: POSIX_COMMAND };
}

export function isOurStopHook(hook: unknown): boolean {
  if (typeof hook !== "object" || hook === null) return false;
  const command = (hook as { command?: unknown }).command;
  return command === POSIX_COMMAND || command === POWERSHELL_COMMAND;
}

export function addStopHook(settingsPath: string, platform: NodeJS.Platform): Promise<HookInstallResult> {
  return addGroupedStopHook(settingsPath, stopHookFor(platform), isOurStopHook);
}

export function removeStopHook(settingsPath: string): Promise<HookRemoveResult> {
  return removeGroupedStopHook(settingsPath, isOurStopHook);
}
