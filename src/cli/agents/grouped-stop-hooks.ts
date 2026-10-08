import { z } from "zod";
import { readJsonConfig, writeJsonConfig, type JsonConfigFailure } from "./json-config";

export type HookInstallResult = "added" | "exists" | "updated" | JsonConfigFailure;

export type HookRemoveResult = "removed" | "absent" | JsonConfigFailure;

export type IsOurHook = (hook: unknown) => boolean;

export type OurHook = { isOurs: IsOurHook; isCurrent: IsOurHook };

export function guardedPosixCommand(backlogArgs: string): string {
  return `command -v backlog >/dev/null && backlog ${backlogArgs} || true`;
}

export function commandOfHook(hook: unknown): string | undefined {
  const command = typeof hook === "object" && hook !== null ? (hook as { command?: unknown }).command : undefined;
  return typeof command === "string" ? command : undefined;
}

const stopGroupSchema = z.object({ hooks: z.array(z.unknown()).optional() }).passthrough();
const groupedConfigSchema = z
  .object({
    hooks: z
      .object({ Stop: z.array(stopGroupSchema).optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

type StopGroup = z.infer<typeof stopGroupSchema>;

type GroupedConfig = z.infer<typeof groupedConfigSchema>;

type StopHookSlots = { lists: unknown[][]; append: (hook: object) => void };

function refreshOurHook(lists: unknown[][], hook: object, { isOurs, isCurrent }: OurHook): "exists" | "updated" | "missing" {
  const ours = lists.flatMap((list) => list.flatMap((entry, index) => (isOurs(entry) ? [{ list, index, entry }] : [])));
  if (ours.some(({ entry }) => isCurrent(entry))) return "exists";
  const stale = ours[0];
  if (stale === undefined) return "missing";
  stale.list[stale.index] = { ...(stale.entry as object), ...hook };
  return "updated";
}

export async function addStopHookIn<T>(path: string, schema: z.ZodType<T>, slotsOf: (config: T) => StopHookSlots, hook: object, ourHook: OurHook): Promise<HookInstallResult> {
  const read = await readJsonConfig(path, schema);
  if (!("config" in read)) return read;
  const slots = slotsOf(read.config);
  const refreshed = refreshOurHook(slots.lists, hook, ourHook);
  if (refreshed === "exists") return "exists";
  if (refreshed === "missing") slots.append(hook);
  await writeJsonConfig(path, read.config);
  return refreshed === "missing" ? "added" : "updated";
}

export async function removeStopHookIn<T>(path: string, schema: z.ZodType<T>, removeOurs: (config: T) => boolean): Promise<HookRemoveResult> {
  const read = await readJsonConfig(path, schema);
  if (!("config" in read)) return read;
  if (!removeOurs(read.config)) return "absent";
  await writeJsonConfig(path, read.config);
  return "removed";
}

export function addGroupedStopHook(path: string, hook: object, ourHook: OurHook): Promise<HookInstallResult> {
  return addStopHookIn(path, groupedConfigSchema, groupedSlots, hook, ourHook);
}

function groupedSlots(config: GroupedConfig): StopHookSlots {
  config.hooks ??= {};
  config.hooks.Stop ??= [];
  const stopGroups = config.hooks.Stop;
  return { lists: stopGroups.flatMap((group) => (group.hooks === undefined ? [] : [group.hooks])), append: (hook) => stopGroups.push({ hooks: [hook] }) };
}

export function removeGroupedStopHook(path: string, isOurs: IsOurHook): Promise<HookRemoveResult> {
  return removeStopHookIn(path, groupedConfigSchema, (config) => {
    const hooks = config.hooks;
    if (hooks?.Stop === undefined || !hooks.Stop.some((group) => hasOurHook(group, isOurs))) return false;
    const kept = hooks.Stop.flatMap((group): StopGroup[] => {
      if (!hasOurHook(group, isOurs)) return [group];
      const others = (group.hooks ?? []).filter((hook) => !isOurs(hook));
      return others.length > 0 ? [{ ...group, hooks: others }] : [];
    });
    if (kept.length > 0) hooks.Stop = kept;
    else delete hooks.Stop;
    return true;
  });
}

function hasOurHook(group: StopGroup, isOurs: IsOurHook): boolean {
  return group.hooks?.some(isOurs) ?? false;
}
