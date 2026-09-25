import { access, mkdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { settingsFilePath } from "../core/store/settings";
import { makeTempDir, projectFile, writeFiles } from "../core/store/testing/temp-dirs";
import { serverLanguage } from "./messages";

describe("язык сервера", () => {
  it("без .settings.json — то же правило, что у CLI, но файл не создаётся", async () => {
    const withProjects = await makeTempDir();
    await writeFiles(withProjects, { "spa/project.md": projectFile("SPA") });
    const empty = await makeTempDir();

    expect(await serverLanguage(withProjects, { LANG: "en_US.UTF-8" })).toBe("ru");
    expect(await serverLanguage(empty, { LANG: "en_US.UTF-8" })).toBe("en");
    await expect(access(settingsFilePath(withProjects))).rejects.toThrow();
  });

  it("нечитаемый .settings.json не роняет сервер — язык по локали", async () => {
    const root = await makeTempDir();
    await mkdir(settingsFilePath(root));

    expect(await serverLanguage(root, { LANG: "ru_RU.UTF-8" })).toBe("ru");
  });
});
