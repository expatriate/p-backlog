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

describe("плагины", () => {
  it("файлы в репозитории совпадают с генератором — после правки скилла или версии запусти npm run plugins", async () => {
    for (const [path, content] of Object.entries(await pluginFiles(repoRoot))) {
      const actual = await readFile(join(repoRoot, path));
      if (typeof content === "string") {
        expect(withUnixNewlines(actual.toString()), path).toBe(withUnixNewlines(content));
      } else {
        expect(actual.equals(content), path).toBe(true);
      }
    }
  });

  it("маркетплейс ведёт на плагины, чьё имя и версия совпадают с пакетом", async () => {
    const { version } = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
    const marketplace = marketplaceSchema.parse(JSON.parse(await readFile(join(repoRoot, ".claude-plugin/marketplace.json"), "utf8")));

    expect(marketplace.plugins.map((plugin) => plugin.name)).toEqual(["p-backlog", "p-backlog-ru"]);
    for (const entry of marketplace.plugins) {
      const pluginRoot = join(repoRoot, entry.source);
      const manifest = pluginSchema.parse(JSON.parse(await readFile(join(pluginRoot, ".claude-plugin/plugin.json"), "utf8")));
      expect(manifest).toMatchObject({ name: entry.name, version });
      expect(withUnixNewlines(await readFile(join(pluginRoot, "skills/backlog/SKILL.md"), "utf8"))).toMatch(/^---\nname: backlog\n/);
    }
  });

  it("русская сборка содержит манифест и изображения для карточки p-backlog в Codex", async () => {
    const pluginRoot = join(repoRoot, "plugins/p-backlog-ru");
    const russianText = z.string().regex(/\p{Script=Cyrillic}/u);
    const assetPath = z.string().startsWith("./assets/");
    const manifest = pluginSchema
      .extend({
        name: z.literal("p-backlog-ru"),
        interface: z.object({
          displayName: z.literal("p-backlog"),
          shortDescription: russianText,
          longDescription: russianText,
          composerIcon: assetPath,
          logo: assetPath,
          screenshots: z.tuple([assetPath]),
        }),
      })
      .parse(JSON.parse(await readFile(join(pluginRoot, ".codex-plugin/plugin.json"), "utf8")));
    const {
      composerIcon,
      logo,
      screenshots: [screenshot],
    } = manifest.interface;
    for (const asset of new Set([composerIcon, logo])) {
      const png = await readFile(join(pluginRoot, asset));
      expect(png.subarray(1, 4).toString(), asset).toBe("PNG");
    }
    const screenshotSource = await readFile(join(repoRoot, "docs/screenshots/ru/tasks.png"));
    expect((await readFile(join(pluginRoot, screenshot))).equals(screenshotSource), screenshot).toBe(true);
  });
});
