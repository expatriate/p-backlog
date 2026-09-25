import { access, mkdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { settingsFilePath } from "../core/store/settings";
import { makeTempDir, projectFile, writeFiles } from "../core/store/testing/temp-dirs";
import { serverLanguage } from "./messages";

describe("язык сервера", () => {
  it("без .settings.json берётся из локали и файл не создаётся — выбор остаётся за пользователем", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": projectFile("SPA") });

    expect(await serverLanguage(root, { LANG: "en_US.UTF-8" })).toBe("en");
    await expect(access(settingsFilePath(root))).rejects.toThrow();
  });

  it("нечитаемый .settings.json не роняет сервер — язык по локали", async () => {
    const root = await makeTempDir();
    await mkdir(settingsFilePath(root));

    expect(await serverLanguage(root, { LANG: "ru_RU.UTF-8" })).toBe("ru");
  });
});
