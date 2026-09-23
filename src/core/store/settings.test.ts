import { chmod, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { readSettings, settledLanguage, writeSettings } from "./settings";
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
    expect(await settledLanguage(root, { LANG: "ru_RU.UTF-8" })).toBe("en");
  });

  it("существующий беклог без настройки остаётся русским и запоминает это", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": projectFile("SPA") });
    expect(await settledLanguage(root, { LANG: "en_US.UTF-8" })).toBe("ru");
    expect(JSON.parse(await readFile(join(root, ".settings.json"), "utf8"))).toEqual({ language: "ru" });
  });

  it("новый беклог берёт язык из локали системы", async () => {
    expect(await settledLanguage(await makeTempDir(), { LANG: "ru_RU.UTF-8" })).toBe("ru");
    expect(await settledLanguage(await makeTempDir(), { LC_ALL: "de_DE.UTF-8", LANG: "ru_RU.UTF-8" })).toBe("en");
  });

  it("язык из локали не флипается на русский, когда в беклоге появляется первый проект", async () => {
    const root = await makeTempDir();
    const env = { LANG: "en_US.UTF-8" };
    expect(await settledLanguage(root, env)).toBe("en");
    await writeFiles(root, { "spa/project.md": projectFile("SPA") });
    expect(await settledLanguage(root, env)).toBe("en");
    expect(JSON.parse(await readFile(join(root, ".settings.json"), "utf8"))).toEqual({ language: "en" });
  });

  it("не сохраняется — определённый язык всё равно возвращается в этот раз", async () => {
    const root = await makeTempDir();
    await chmod(root, 0o500);
    onTestFinished(() => chmod(root, 0o700));
    expect(await settledLanguage(root, { LANG: "en_US.UTF-8" })).toBe("en");
  });
});
