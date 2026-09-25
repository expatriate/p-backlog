import { z } from "zod";
import { readJsonConfig, writeJsonConfig, type JsonConfigFailure } from "./json-config";

export type HookInstallResult = "added" | "exists" | JsonConfigFailure;

export type HookRemoveResult = "removed" | "absent" | JsonConfigFailure;

export type IsOurHook = (hook: unknown) => boolean;

const stopGroupSchema = z.object({ hooks: z.array(z.unknown()).optional() }).passthrough();
const groupedConfigSchema = z
  .object({ hooks: z.object({ Stop: z.array(stopGroupSchema).optional() }).passthrough().optional() })
  .passthrough();

type StopGroup = z.infer<typeof stopGroupSchema>;

export async function addGroupedStopHook(path: string, hook: object, isOurs: IsOurHook): Promise<HookInstallResult> {
  const read = await readJsonConfig(path, groupedConfigSchema);
  if (!("config" in read)) return read;
  const stopGroups = ((read.config.hooks ??= {}).Stop ??= []);
  if (stopGroups.some((group) => hasOurHook(group, isOurs))) return "exists";
  stopGroups.push({ hooks: [hook] });
  await writeJsonConfig(path, read.config);
  return "added";
}

export async function removeGroupedStopHook(path: string, isOurs: IsOurHook): Promise<HookRemoveResult> {
  const read = await readJsonConfig(path, groupedConfigSchema);
  if (!("config" in read)) return read;
  const hooks = read.config.hooks;
  if (hooks?.Stop === undefined || !hooks.Stop.some((group) => hasOurHook(group, isOurs))) return "absent";
  const kept = hooks.Stop.flatMap((group): StopGroup[] => {
    if (!hasOurHook(group, isOurs)) return [group];
    const others = (group.hooks ?? []).filter((hook) => !isOurs(hook));
    return others.length > 0 ? [{ ...group, hooks: others }] : [];
  });
  if (kept.length > 0) hooks.Stop = kept;
  else delete hooks.Stop;
  await writeJsonConfig(path, read.config);
  return "removed";
}

function hasOurHook(group: StopGroup, isOurs: IsOurHook): boolean {
  return group.hooks?.some(isOurs) ?? false;
}
