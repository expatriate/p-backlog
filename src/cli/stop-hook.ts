import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { errorText } from "../core/errors";
import { hasErrorCode, parseJson } from "../core/store/fs-utils";

const POSIX_COMMAND = "command -v backlog >/dev/null && backlog hook stop || true";
const POWERSHELL_COMMAND = "if (Get-Command backlog -ErrorAction SilentlyContinue) { $input | backlog hook stop }";

type StopHook = { type: "command"; command: string; shell?: "powershell" };

export type StopHookResult = "added" | "exists" | { failed: "unreadable"; code: string } | { failed: "invalid" };

const stopHookGroupSchema = z.object({ hooks: z.array(z.unknown()).optional() }).passthrough();
const settingsSchema = z
  .object({ hooks: z.object({ Stop: z.array(stopHookGroupSchema).optional() }).passthrough().optional() })
  .passthrough();

export function stopHookFor(platform: NodeJS.Platform): StopHook {
  return platform === "win32" ? { type: "command", shell: "powershell", command: POWERSHELL_COMMAND } : { type: "command", command: POSIX_COMMAND };
}

export function isOurStopHook(hook: unknown): boolean {
  if (typeof hook !== "object" || hook === null) return false;
  const command = (hook as { command?: unknown }).command;
  return command === POSIX_COMMAND || command === POWERSHELL_COMMAND;
}

export async function addStopHook(settingsPath: string, platform: NodeJS.Platform): Promise<StopHookResult> {
  const text = await readSettingsText(settingsPath);
  if (typeof text !== "string") return text;
  const settings = parseJson(text, settingsSchema);
  if (settings === null) return { failed: "invalid" };
  const hooks = (settings.hooks ??= {});
  const stopGroups = (hooks.Stop ??= []);
  const installed = stopGroups.some((group) => group.hooks?.some(isOurStopHook) ?? false);
  if (installed) return "exists";
  stopGroups.push({ hooks: [stopHookFor(platform)] });
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  return "added";
}

async function readSettingsText(settingsPath: string): Promise<string | { failed: "unreadable"; code: string }> {
  try {
    return await readFile(settingsPath, "utf8");
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return "{}";
    return { failed: "unreadable", code: errorCodeOf(error) };
  }
}

function errorCodeOf(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  return typeof code === "string" ? code : errorText(error);
}
