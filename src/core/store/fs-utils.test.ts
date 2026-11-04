import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contentVersion, fileExists, readTextIfFile, removeIfUnchanged } from "./fs-utils";
import { makeTempDir, writeFiles } from "./testing/temp-dirs";

describe("readTextIfFile и fileExists", () => {
  it("каталог и путь сквозь файл — файла нет, а не ошибка: source задачи бывает каталогом или опечаткой", async () => {
    const dir = await makeTempDir();
    await writeFiles(dir, { "src/a.ts": "a\n" });

    expect(await readTextIfFile(join(dir, "src"))).toBeNull();
    expect(await readTextIfFile(join(dir, "src/a.ts/b.ts"))).toBeNull();
    expect(await fileExists(join(dir, "src/a.ts/b.ts"))).toBe(false);
    expect(await fileExists(join(dir, "src"))).toBe(true);
  });
});

describe("removeIfUnchanged", () => {
  it("удаляет файл, только если его содержимое не менялось; уже удалённый другим процессом файл не выдаёт за своё удаление", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "same.md": "было\n", "changed.md": "было\n", "gone.md": "было\n" });
    await writeFile(join(root, "changed.md"), "стало\n");
    await rm(join(root, "gone.md"));
    const version = contentVersion("было\n");

    expect(await removeIfUnchanged(join(root, "same.md"), version)).toBe("removed");
    expect(await removeIfUnchanged(join(root, "changed.md"), version)).toBe("changed");
    expect(await removeIfUnchanged(join(root, "gone.md"), version)).toBe("already-gone");

    await expect(readFile(join(root, "same.md"))).rejects.toThrow(/ENOENT/);
    expect(await readFile(join(root, "changed.md"), "utf8")).toBe("стало\n");
  });
});
