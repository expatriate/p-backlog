import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contentVersion, removeIfUnchanged } from "./fs-utils";
import { makeTempDir, writeFiles } from "./testing/temp-dirs";

describe("removeIfUnchanged", () => {
  it("удаляет файл, только если его содержимое не менялось с ожидаемой версии", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "same.md": "было\n", "changed.md": "было\n", "gone.md": "было\n" });
    await writeFile(join(root, "changed.md"), "стало\n");
    await rm(join(root, "gone.md"));
    const version = contentVersion("было\n");

    expect(await removeIfUnchanged(join(root, "same.md"), version)).toBe(true);
    expect(await removeIfUnchanged(join(root, "changed.md"), version)).toBe(false);
    expect(await removeIfUnchanged(join(root, "gone.md"), version)).toBe(true);

    await expect(readFile(join(root, "same.md"))).rejects.toThrow(/ENOENT/);
    expect(await readFile(join(root, "changed.md"), "utf8")).toBe("стало\n");
  });
});
