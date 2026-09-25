import { mkdir, readFile, readlink, realpath, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { errorCodeOrText, hasErrorCode } from "../core/errors";
import { writeFileAtomic } from "../core/store/fs-utils";

const POSIX_COMMAND = "command -v backlog >/dev/null && backlog hook stop || true";
const POWERSHELL_COMMAND = "if (Get-Command backlog.cmd -ErrorAction SilentlyContinue) { backlog.cmd hook stop }";

const MAX_LINK_HOPS = 40;

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
  const settings = validatedSettings(text);
  if (settings === null) return { failed: "invalid" };
  const hooks = (settings.hooks ??= {});
  const stopGroups = (hooks.Stop ??= []);
  const installed = stopGroups.some((group) => group.hooks?.some(isOurStopHook) ?? false);
  if (installed) return "exists";
  stopGroups.push({ hooks: [stopHookFor(platform)] });
  await mkdir(dirname(settingsPath), { recursive: true });
  const target = await writeTargetOf(settingsPath);
  const mode = await stat(target).then(({ mode }) => mode & 0o777, () => undefined);
  await writeFileAtomic(target, `${JSON.stringify(settings, null, 2)}\n`, mode);
  return "added";
}

function validatedSettings(text: string): Settings | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  return settingsSchema.safeParse(value).success ? (value as Settings) : null;
}

async function writeTargetOf(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return danglingLinkTarget(path);
    throw error;
  }
}

async function danglingLinkTarget(path: string): Promise<string> {
  let current = path;
  for (let hop = 0; hop < MAX_LINK_HOPS; hop++) {
    const link = await readlink(current).catch(() => null);
    if (link === null) return current;
    current = resolve(dirname(current), link);
  }
  return current;
}

async function readSettingsText(settingsPath: string): Promise<string | { failed: "unreadable"; code: string }> {
  try {
    return await readFile(settingsPath, "utf8");
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return "{}";
    return { failed: "unreadable", code: errorCodeOrText(error) };
  }
}
