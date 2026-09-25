import { z } from "zod";
import { readJsonConfig, writeJsonConfig, type JsonConfigFailure } from "./json-config";

export type HookInstallResult = "added" | "exists" | "updated" | JsonConfigFailure;

export type HookRemoveResult = "removed" | "absent" | JsonConfigFailure;

export type IsOurHook = (hook: unknown) => boolean;

export type OurHook = { isOurs: IsOurHook; isCurrent: IsOurHook };

const stopGroupSchema = z.object({ hooks: z.array(z.unknown()).optional() }).passthrough();
const groupedConfigSchema = z
  .object({ hooks: z.object({ Stop: z.array(stopGroupSchema).optional() }).passthrough().optional() })
  .passthrough();

type StopGroup = z.infer<typeof stopGroupSchema>;

export function refreshOurHook(lists: unknown[][], hook: object, { isOurs, isCurrent }: OurHook): "exists" | "updated" | "missing" {
  const ours = lists.flatMap((list) => list.flatMap((entry, index) => (isOurs(entry) ? [{ list, index, entry }] : [])));
  if (ours.some(({ entry }) => isCurrent(entry))) return "exists";
  const stale = ours[0];
  if (stale === undefined) return "missing";
  stale.list[stale.index] = { ...(stale.entry as object), ...hook };
  return "updated";
}

export async function addGroupedStopHook(path: string, hook: object, ourHook: OurHook): Promise<HookInstallResult> {
  const read = await readJsonConfig(path, groupedConfigSchema);
  if (!("config" in read)) return read;
  const stopGroups = ((read.config.hooks ??= {}).Stop ??= []);
  const refreshed = refreshOurHook(stopGroups.flatMap((group) => (group.hooks === undefined ? [] : [group.hooks])), hook, ourHook);
  if (refreshed === "exists") return "exists";
  if (refreshed === "missing") stopGroups.push({ hooks: [hook] });
  await writeJsonConfig(path, read.config);
  return refreshed === "missing" ? "added" : "updated";
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
