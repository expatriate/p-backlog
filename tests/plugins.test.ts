import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { pluginFiles } from "../scripts/plugins/plugin-files";

const repoRoot = join(import.meta.dirname, "..");
const withUnixNewlines = (text: string) => text.replace(/\r\n/g, "\n");
const kebab = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const marketplaceSchema = z.object({
  name: kebab,
  owner: z.object({ name: z.string().min(1) }),
  plugins: z.array(z.object({ name: kebab, source: z.string().startsWith("./plugins/") })).min(1),
});
const pluginSchema = z.object({ name: kebab, version: z.string(), description: z.string().min(1) });

describe("плагины Claude Code", () => {
  it("файлы в репозитории совпадают с генератором — после правки скилла или версии запусти npm run plugins", async () => {
    for (const [path, content] of Object.entries(await pluginFiles(repoRoot))) {
      expect(withUnixNewlines(await readFile(join(repoRoot, path), "utf8")), path).toBe(withUnixNewlines(content));
    }
  });

  it("маркетплейс ведёт на плагины, чьё имя и версия совпадают с пакетом", async () => {
    const files = await pluginFiles(repoRoot);
    const { version } = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
    const marketplace = marketplaceSchema.parse(JSON.parse(files[".claude-plugin/marketplace.json"] ?? ""));

    expect(marketplace.plugins.map((plugin) => plugin.name)).toEqual(["p-backlog", "p-backlog-ru"]);
    for (const entry of marketplace.plugins) {
      const manifest = pluginSchema.parse(JSON.parse(files[`${entry.source.slice(2)}/.claude-plugin/plugin.json`] ?? ""));
      expect(manifest).toMatchObject({ name: entry.name, version });
      expect(files[`${entry.source.slice(2)}/skills/backlog/SKILL.md`]).toMatch(/^---\nname: backlog\n/);
    }
  });
});
