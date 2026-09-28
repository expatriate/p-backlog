import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { Language } from "../../src/core/i18n/language";
import { SKILL_SOURCES_DIR, SKILL_VARIANTS } from "../../src/cli/skill-variants";
import { SKILL_NAME } from "../../src/core/skill-name";

const MARKETPLACE = "p-backlog";
const OWNER = { name: "expatriate" };
const REPOSITORY = "https://github.com/expatriate/p-backlog";
const KEYWORDS = ["backlog", "tech-debt", "code-review", "tasks", "stop-hook"];
const PLUGIN_DESCRIPTIONS: Record<Language, string> = {
  en: "Local backlog for coding agents: the skill files out-of-scope issues as Markdown tasks with context, the Stop hook asks to re-check tasks whose code changed. Needs the CLI: npm i -g p-backlog.",
  ru: "p-backlog with the Russian-language skill. Needs the CLI: npm i -g p-backlog.",
};
const PLUGINS = (Object.keys(PLUGIN_DESCRIPTIONS) as Language[]).map((language) => {
  const { plugin, sourceDir } = SKILL_VARIANTS[language];
  return { name: plugin, skillDir: join(SKILL_SOURCES_DIR, sourceDir), description: PLUGIN_DESCRIPTIONS[language] };
});
const packageManifestSchema = z.object({ version: z.string(), license: z.string(), homepage: z.string() });
const STOP_HOOK_SOURCE = "scripts/plugins/stop.mjs";
const HOOKS = { hooks: { Stop: [{ hooks: [{ type: "command", command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/hooks/stop.mjs"] }] }] } };

export async function pluginFiles(repoRoot: string): Promise<Record<string, string>> {
  const manifest = packageManifestSchema.parse(JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8")));
  const stopHook = await readFile(join(repoRoot, STOP_HOOK_SOURCE), "utf8");
  const files: Record<string, string> = {
    ".claude-plugin/marketplace.json": json({
      name: MARKETPLACE,
      owner: OWNER,
      plugins: PLUGINS.map(({ name, description }) => ({ name, source: `./plugins/${name}`, description })),
    }),
  };
  for (const plugin of PLUGINS) {
    const dir = `plugins/${plugin.name}`;
    files[`${dir}/.claude-plugin/plugin.json`] = json({
      name: plugin.name,
      description: plugin.description,
      version: manifest.version,
      author: OWNER,
      homepage: manifest.homepage,
      repository: REPOSITORY,
      license: manifest.license,
      keywords: KEYWORDS,
    });
    files[`${dir}/skills/${SKILL_NAME}/SKILL.md`] = await readFile(join(repoRoot, plugin.skillDir, "SKILL.md"), "utf8");
    files[`${dir}/hooks/hooks.json`] = json(HOOKS);
    files[`${dir}/hooks/stop.mjs`] = stopHook;
  }
  return files;
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
