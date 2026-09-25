import { z } from "zod";
import { refreshOurHook, type HookInstallResult, type HookRemoveResult, type IsOurHook, type OurHook } from "./grouped-stop-hooks";
import { readJsonConfig, writeJsonConfig } from "./json-config";

const CURSOR_HOOKS_VERSION = 1;

const cursorConfigSchema = z
  .object({ version: z.number().optional(), hooks: z.object({ stop: z.array(z.unknown()).optional() }).passthrough().optional() })
  .passthrough();

export async function addCursorStopHook(path: string, hook: { command: string }, ourHook: OurHook): Promise<HookInstallResult> {
  const read = await readJsonConfig(path, cursorConfigSchema);
  if (!("config" in read)) return read;
  const stop = ((read.config.hooks ??= {}).stop ??= []);
  const refreshed = refreshOurHook([stop], hook, ourHook);
  if (refreshed === "exists") return "exists";
  if (refreshed === "missing") stop.push(hook);
  read.config.version ??= CURSOR_HOOKS_VERSION;
  await writeJsonConfig(path, read.config);
  return refreshed === "missing" ? "added" : "updated";
}

export async function removeCursorStopHook(path: string, isOurs: IsOurHook): Promise<HookRemoveResult> {
  const read = await readJsonConfig(path, cursorConfigSchema);
  if (!("config" in read)) return read;
  const hooks = read.config.hooks;
  if (hooks?.stop === undefined || !hooks.stop.some(isOurs)) return "absent";
  const kept = hooks.stop.filter((hook) => !isOurs(hook));
  if (kept.length > 0) hooks.stop = kept;
  else delete hooks.stop;
  await writeJsonConfig(path, read.config);
  return "removed";
}
