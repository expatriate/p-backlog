import { mkdir, readFile, realpath, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { errorText } from "../core/errors";
import { hasErrorCode, writeFileAtomic } from "../core/store/fs-utils";

const POSIX_COMMAND = "command -v backlog >/dev/null && backlog hook stop || true";
const POWERSHELL_COMMAND = "if (Get-Command backlog.cmd -ErrorAction SilentlyContinue) { backlog.cmd hook stop }";

type StopHook = { type: "command"; command: string; shell?: "powershell" };

export type StopHookResult = "added" | "exists" | { failed: "unreadable"; code: string } | { failed: "invalid" };

const stopHookGroupSchema = z.object({ hooks: z.array(z.unknown()).optional() }).passthrough();
const settingsSchema = z
  .object({ hooks: z.object({ Stop: z.array(stopHookGroupSchema).optional() }).passthrough().optional() })
  .passthrough();

type Settings = z.infer<typeof settingsSchema>;

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
  const settings = parseSettingsInPlace(text);
  if (settings === null) return { failed: "invalid" };
  const hooks = (settings.hooks ??= {});
  const stopGroups = (hooks.Stop ??= []);
  const installed = stopGroups.some((group) => group.hooks?.some(isOurStopHook) ?? false);
  if (installed) return "exists";
  stopGroups.push({ hooks: [stopHookFor(platform)] });
  const target = await realFileOf(settingsPath);
  await mkdir(dirname(target), { recursive: true });
  const mode = await stat(target).then(({ mode }) => mode & 0o777, () => undefined);
  await writeFileAtomic(target, `${JSON.stringify(settings, null, 2)}\n`, mode);
  return "added";
}

function parseSettingsInPlace(text: string): Settings | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  return settingsSchema.safeParse(value).success ? (value as Settings) : null;
}

async function realFileOf(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return path;
    throw error;
  }
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
