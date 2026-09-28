import { describe, expect, it } from "vitest";
import { claudeStopHookFor, isOurClaudeStopHook } from "./claude-hooks";

const POSIX_COMMAND = "command -v backlog >/dev/null && backlog hook stop || true";
const POWERSHELL_COMMAND = "if (Get-Command backlog.cmd -ErrorAction SilentlyContinue) { backlog.cmd hook stop }";

describe("claudeStopHookFor", () => {
  it("на Windows отдаёт хук для PowerShell, на остальных платформах — для POSIX-шелла", () => {
    expect(claudeStopHookFor("win32")).toEqual({ type: "command", shell: "powershell", command: POWERSHELL_COMMAND });
    expect(claudeStopHookFor("darwin")).toEqual({ type: "command", command: POSIX_COMMAND });
    expect(claudeStopHookFor("linux")).toEqual({ type: "command", command: POSIX_COMMAND });
  });
});

describe("isOurClaudeStopHook", () => {
  it("узнаёт обе свои формы хука и отвергает чужие команды и не-объекты", () => {
    expect(isOurClaudeStopHook(claudeStopHookFor("win32"))).toBe(true);
    expect(isOurClaudeStopHook(claudeStopHookFor("darwin"))).toBe(true);
    expect(isOurClaudeStopHook({ type: "command", command: "say готово" })).toBe(false);
    expect(isOurClaudeStopHook(null)).toBe(false);
    expect(isOurClaudeStopHook(POSIX_COMMAND)).toBe(false);
  });
});
