import { describe, expect, it } from "vitest";
import { isOurStopHook, stopHookFor } from "./stop-hook";

const POSIX_COMMAND = "command -v backlog >/dev/null && backlog hook stop || true";
const POWERSHELL_COMMAND = "if (Get-Command backlog -ErrorAction SilentlyContinue) { $input | backlog hook stop }";

describe("stopHookFor", () => {
  it("на Windows отдаёт хук для PowerShell, на остальных платформах — для POSIX-шелла", () => {
    expect(stopHookFor("win32")).toEqual({ type: "command", shell: "powershell", command: POWERSHELL_COMMAND });
    expect(stopHookFor("darwin")).toEqual({ type: "command", command: POSIX_COMMAND });
    expect(stopHookFor("linux")).toEqual({ type: "command", command: POSIX_COMMAND });
  });
});

describe("isOurStopHook", () => {
  it("узнаёт обе свои формы хука и отвергает чужие команды и не-объекты", () => {
    expect(isOurStopHook(stopHookFor("win32"))).toBe(true);
    expect(isOurStopHook(stopHookFor("darwin"))).toBe(true);
    expect(isOurStopHook({ type: "command", command: "say готово" })).toBe(false);
    expect(isOurStopHook(null)).toBe(false);
    expect(isOurStopHook(POSIX_COMMAND)).toBe(false);
  });
});
