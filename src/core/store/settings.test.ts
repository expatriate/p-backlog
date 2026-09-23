import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readSettings, resolveLanguage, writeSettings } from "./settings";
import { makeTempDir, projectFile, writeFiles } from "./testing/temp-dirs";

describe("настройка беклога", () => {
  it("без записанного файла — null, после записи возвращает записанное", async () => {
    const root = await makeTempDir();
    expect(await readSettings(root)).toBeNull();
    await writeSettings(root, { language: "en" });
    expect(await readSettings(root)).toEqual({ language: "en" });
  });
});

describe("язык беклога", () => {
  it("настройка главнее всего", async () => {
    const root = await makeTempDir();
    await writeSettings(root, { language: "en" });
    expect(await resolveLanguage(root, { LANG: "ru_RU.UTF-8" })).toBe("en");
  });

  it("существующий беклог без настройки остаётся русским и запоминает это", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": projectFile("SPA") });
    expect(await resolveLanguage(root, { LANG: "en_US.UTF-8" })).toBe("ru");
    expect(JSON.parse(await readFile(join(root, ".settings.json"), "utf8"))).toEqual({ language: "ru" });
  });

  it("новый беклог берёт язык из локали системы", async () => {
    expect(await resolveLanguage(await makeTempDir(), { LANG: "ru_RU.UTF-8" })).toBe("ru");
    expect(await resolveLanguage(await makeTempDir(), { LC_ALL: "de_DE.UTF-8", LANG: "ru_RU.UTF-8" })).toBe("en");
  });
});
