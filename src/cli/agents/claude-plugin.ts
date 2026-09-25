import { z } from "zod";
import { claudeSettingsPath } from "../../core/claude-dir";
import type { Language } from "../../core/i18n/language";
import { readJsonFile } from "../../core/store/fs-utils";
import type { Agent, AgentPlaces } from "./agent";

const PLUGIN_BY_LANGUAGE: Record<Language, string> = { en: "p-backlog", ru: "p-backlog-ru" };
const PLUGIN_NAMES = new Set(Object.values(PLUGIN_BY_LANGUAGE));
const MARKETPLACE_SEPARATOR = "@";

const enabledPluginsSchema = z.object({ enabledPlugins: z.record(z.string(), z.unknown()).optional() });

export async function agentPlugin(agent: Agent, { env, home }: AgentPlaces): Promise<string | null> {
  if (agent !== "claude") return null;
  const settings = await readJsonFile(claudeSettingsPath(env, home), enabledPluginsSchema);
  const enabled = Object.entries(settings?.enabledPlugins ?? {}).find(([id, on]) => on === true && PLUGIN_NAMES.has(pluginName(id)));
  return enabled?.[0] ?? null;
}

export function pluginToSwitchTo(pluginId: string, language: Language): string | null {
  const wanted = PLUGIN_BY_LANGUAGE[language];
  if (pluginName(pluginId) === wanted) return null;
  const marketplace = pluginId.slice(pluginId.indexOf(MARKETPLACE_SEPARATOR) + 1);
  return `${wanted}${MARKETPLACE_SEPARATOR}${marketplace}`;
}

function pluginName(pluginId: string): string {
  return pluginId.split(MARKETPLACE_SEPARATOR)[0] ?? pluginId;
}
