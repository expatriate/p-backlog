import { readFile, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FileBusyError, withAvailableLocks, withFileLock } from "./file-lock";
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

  it("несколько занятых файлов набора вместе ждут один предел, а свободные всё равно берутся", async () => {
    const dir = await makeTempDir();
    const waitLimitMs = 300;
    const busy = ["T-1.md", "T-2.md", "T-3.md", "T-4.md"];
    const free = ["T-0.md", "T-5.md"].map((name) => join(dir, name));
    for (const name of busy) await writeFile(join(dir, `.${name}.lock`), "другой процесс");

    const startedAt = Date.now();
    const locked = await withAvailableLocks([...busy.map((name) => join(dir, name)), ...free], async (acquired) => acquired, { waitLimitMs });

    expect(locked).toEqual(new Set(free));
    expect(Date.now() - startedAt).toBeLessThan(busy.length * waitLimitMs);
  });
});
