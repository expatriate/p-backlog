import { readFile, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileBusyError, withFileLock } from "./file-lock";
import { SHORT_LOCK_WAIT } from "./testing/lock-wait";
import { makeTempDir } from "./testing/temp-dirs";

describe("блокировка файла", () => {
  it("блокировка, брошенная упавшим процессом, не держит файл вечно", async () => {
    const dir = await makeTempDir();
    const lock = join(dir, ".SPA-1.md.lock");
    await writeFile(lock, "12345");
    const longAgo = new Date(Date.now() - 60 * 60 * 1000);
    await utimes(lock, longAgo, longAgo);

    expect(await withFileLock(join(dir, "SPA-1.md"), async () => "записано")).toBe("записано");
  });

  it("брошенную блокировку ломает один ожидающий: второй не вмешивается, пока первый её снимает", async () => {
    const dir = await makeTempDir();
    const lock = join(dir, ".SPA-1.md.lock");
    await writeFile(lock, "12345");
    const longAgo = new Date(Date.now() - 60 * 60 * 1000);
    await utimes(lock, longAgo, longAgo);
    await writeFile(`${lock}.break`, "12345");

    await expect(withFileLock(join(dir, "SPA-1.md"), async () => "записано", SHORT_LOCK_WAIT)).rejects.toThrow(FileBusyError);
    expect(await readFile(lock, "utf8")).toBe("12345");
  });

  it("снятие не удаляет чужую блокировку, занявшую место нашей", async () => {
    const dir = await makeTempDir();
    const lock = join(dir, ".SPA-1.md.lock");

    await withFileLock(join(dir, "SPA-1.md"), async () => {
      await writeFile(lock, "другой процесс");
    });

    expect(await readFile(lock, "utf8")).toBe("другой процесс");
  });
});
