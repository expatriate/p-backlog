import { access, chmod, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { readLanguageOrLocale, settingsFilePath, settleLanguage, writeSettings } from "./settings";
import { makeTempDir, projectFile, writeFiles } from "./testing/temp-dirs";

describe("язык беклога", () => {
  it("настройка главнее всего", async () => {
    const root = await makeTempDir();
    await writeSettings(root, { language: "en" });
    expect((await settleLanguage(root, { LANG: "ru_RU.UTF-8" })).language).toBe("en");
  });

  it("существующий беклог без настройки остаётся русским и запоминает это", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": projectFile("SPA") });
    expect((await settleLanguage(root, { LANG: "en_US.UTF-8" })).language).toBe("ru");
    expect(JSON.parse(await readFile(join(root, ".settings.json"), "utf8"))).toEqual({ language: "ru" });
  });

  it("новый беклог берёт язык из локали системы", async () => {
    expect((await settleLanguage(await makeTempDir(), { LANG: "ru_RU.UTF-8" })).language).toBe("ru");
    expect((await settleLanguage(await makeTempDir(), { LC_ALL: "de_DE.UTF-8", LANG: "ru_RU.UTF-8" })).language).toBe("en");
  });

  it("язык из локали не флипается на русский, когда в беклоге появляется первый проект", async () => {
    const root = await makeTempDir();
    const env = { LANG: "en_US.UTF-8" };
    expect((await settleLanguage(root, env)).language).toBe("en");
    await writeFiles(root, { "spa/project.md": projectFile("SPA") });
    expect((await settleLanguage(root, env)).language).toBe("en");
    expect(JSON.parse(await readFile(join(root, ".settings.json"), "utf8"))).toEqual({ language: "en" });
  });

  it.skipIf(process.platform === "win32")("не сохраняется — язык всё равно определён на этот раз, а причина сбоя возвращается вызывающему (на Windows chmod не закрывает каталог)", async () => {
    const root = await makeTempDir();
    await chmod(root, 0o500);
    onTestFinished(() => chmod(root, 0o700));

    expect(await settleLanguage(root, { LANG: "en_US.UTF-8" })).toEqual({ language: "en", invalidSettingsFile: false, saveFailure: expect.stringContaining("EACCES") });
    await expect(access(settingsFilePath(root))).rejects.toThrow();
  });

  it("битый файл настройки не перезаписывается, язык определяется по локали на этот запуск", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "spa/project.md": projectFile("SPA"), ".settings.json": '{"language":"EN"}' });

    expect(await settleLanguage(root, { LANG: "en_US.UTF-8" })).toEqual({ language: "en", invalidSettingsFile: true, saveFailure: null });
    expect(await readFile(join(root, ".settings.json"), "utf8")).toBe('{"language":"EN"}');
  });

  it("чтение без .settings.json — то же правило, что у settleLanguage, но файл не создаётся", async () => {
    const withProjects = await makeTempDir();
    await writeFiles(withProjects, { "spa/project.md": projectFile("SPA") });
    const empty = await makeTempDir();

    expect(await readLanguageOrLocale(withProjects, { LANG: "en_US.UTF-8" })).toBe("ru");
    expect(await readLanguageOrLocale(empty, { LANG: "en_US.UTF-8" })).toBe("en");
    await expect(access(settingsFilePath(withProjects))).rejects.toThrow();
  });

  it("нечитаемый .settings.json при чтении не роняет вызывающего — язык по локали", async () => {
    const root = await makeTempDir();
    await mkdir(settingsFilePath(root));

    expect(await readLanguageOrLocale(root, { LANG: "ru_RU.UTF-8" })).toBe("ru");
  });
});
