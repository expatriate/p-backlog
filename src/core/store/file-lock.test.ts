import { readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FileBusyError, withAvailableLocks, withFileLock } from "./file-lock";
import { failingOnce } from "./testing/fs-failures";
import { SHORT_LOCK_WAIT } from "./testing/lock-wait";
import { asIfOnWindows } from "./testing/platform";
import { makeTempDir } from "./testing/temp-dirs";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, rm: vi.fn(actual.rm) };
});

describe("блокировка файла", () => {
  it("на Windows блокировка, которую другой процесс на миг не дал удалить, всё равно снимается — следующая правка не ждёт 30 с", async () => {
    const path = join(await makeTempDir(), "SPA-1.md");
    const lockRemoval = (target: Parameters<typeof rm>[0]) => String(target).endsWith(".SPA-1.md.lock");

    await asIfOnWindows(() => failingOnce(rm, lockRemoval, () => withFileLock(path, async () => "первая"), { code: "EBUSY" }));

    expect(await withFileLock(path, async () => "вторая", SHORT_LOCK_WAIT)).toBe("вторая");
  });

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

  it("долгая работа под блокировкой продлевает её: ожидающий не считает её брошенной", async () => {
    const dir = await makeTempDir();
    const path = join(dir, "SPA-1.md");
    const lock = join(dir, ".SPA-1.md.lock");
    const longAgo = new Date(Date.now() - 60 * 60 * 1000);
    vi.useFakeTimers({ toFake: ["setInterval"] });
    try {
      await withFileLock(path, async () => {
        await utimes(lock, longAgo, longAgo);
        vi.advanceTimersByTime(30_000);
        await vi.waitFor(async () => expect((await stat(lock)).mtimeMs).toBeGreaterThan(longAgo.getTime()));

        await expect(withFileLock(path, async () => "перехвачено", SHORT_LOCK_WAIT)).rejects.toThrow(FileBusyError);
      });
    } finally {
      vi.useRealTimers();
    }
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
