import { z } from "zod";
import { addStopHookIn, removeStopHookIn, type HookInstallResult, type HookRemoveResult, type IsOurHook, type OurHook } from "./grouped-stop-hooks";

const CURSOR_HOOKS_VERSION = 1;

const cursorConfigSchema = z
  .object({
    version: z.number().optional(),
    hooks: z
      .object({ stop: z.array(z.unknown()).optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

export function addCursorStopHook(path: string, hook: { command: string }, ourHook: OurHook): Promise<HookInstallResult> {
  return addStopHookIn(
    path,
    cursorConfigSchema,
    (config) => {
      config.hooks ??= {};
      config.hooks.stop ??= [];
      config.version ??= CURSOR_HOOKS_VERSION;
      const stop = config.hooks.stop;
      return { lists: [stop], append: (added) => stop.push(added) };
    },
    hook,
    ourHook,
  );
}

export function removeCursorStopHook(path: string, isOurs: IsOurHook): Promise<HookRemoveResult> {
  return removeStopHookIn(path, cursorConfigSchema, (config) => {
    const hooks = config.hooks;
    if (hooks?.stop === undefined || !hooks.stop.some(isOurs)) return false;
    const kept = hooks.stop.filter((hook) => !isOurs(hook));
    if (kept.length > 0) hooks.stop = kept;
    else delete hooks.stop;
    return true;
  });
}
