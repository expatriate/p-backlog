import { z } from "zod";
import type { Language } from "../../core/i18n/language";
import type { PathErrorHandler } from "../../core/errors";
import { readJsonFile, readReportingFailure } from "../../core/store/fs-utils";
import { SKILL_VARIANTS } from "../skill-variants";
import { AGENT_SPECS, type Agent, type AgentPlaces } from "./agent";

const PLUGIN_NAMES = new Set(Object.values(SKILL_VARIANTS).map((variant) => variant.plugin));
const MARKETPLACE_SEPARATOR = "@";

const enabledPluginsSchema = z.object({ enabledPlugins: z.record(z.string(), z.unknown()).optional() });

type PluginLookup = { plugin: string | null };

export async function agentPluginReportingFailure(agent: Agent, places: AgentPlaces, onUnreadable: PathErrorHandler): Promise<PluginLookup | null> {
  const settingsPath = AGENT_SPECS[agent].pluginSettingsPath;
  if (settingsPath === null) return { plugin: null };
  return readReportingFailure(settingsPath(places), readEnabledPlugin, onUnreadable);
}

async function readEnabledPlugin(path: string): Promise<PluginLookup> {
  const settings = await readJsonFile(path, enabledPluginsSchema);
  const enabled = Object.entries(settings?.enabledPlugins ?? {}).find(([id, on]) => on === true && PLUGIN_NAMES.has(pluginName(id)));
  return { plugin: enabled?.[0] ?? null };
}

export function pluginToSwitchTo(pluginId: string, language: Language): string | null {
  const wanted = SKILL_VARIANTS[language].plugin;
  if (pluginName(pluginId) === wanted) return null;
  const separator = pluginId.indexOf(MARKETPLACE_SEPARATOR);
  return separator === -1 ? wanted : `${wanted}${pluginId.slice(separator)}`;
}

function pluginName(pluginId: string): string {
  return pluginId.split(MARKETPLACE_SEPARATOR)[0] ?? pluginId;
}
