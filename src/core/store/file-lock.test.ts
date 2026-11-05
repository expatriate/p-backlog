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

async function writeAbandonedLock(dir: string): Promise<string> {
  const lock = join(dir, ".SPA-1.md.lock");
  await writeFile(lock, "12345");
  const longAgo = new Date(Date.now() - 60 * 60 * 1000);
  await utimes(lock, longAgo, longAgo);
  return lock;
}

describe("блокировка файла", () => {
  it("на Windows блокировка, которую другой процесс на миг не дал удалить, всё равно снимается — следующая правка не ждёт 30 с", async () => {
    const path = join(await makeTempDir(), "SPA-1.md");
    const lockRemoval = (target: Parameters<typeof rm>[0]) => String(target).endsWith(".SPA-1.md.lock");

    await asIfOnWindows(() => failingOnce(rm, lockRemoval, () => withFileLock(path, async () => "первая"), { code: "EBUSY" }));

    expect(await withFileLock(path, async () => "вторая", SHORT_LOCK_WAIT)).toBe("вторая");
  });

  it("блокировка, брошенная упавшим процессом, не держит файл вечно", async () => {
    const dir = await makeTempDir();
    await writeAbandonedLock(dir);

    expect(await withFileLock(join(dir, "SPA-1.md"), async () => "записано")).toBe("записано");
  });

  it.each([".SPA-1.md.lock", ".SPA-1.md.lock.break"])("на Windows брошенная блокировка снимается, даже если %s на миг не дали удалить", async (blocked) => {
    const dir = await makeTempDir();
    await writeAbandonedLock(dir);

    const result = await asIfOnWindows(() =>
      failingOnce(
        rm,
        (target) => String(target).endsWith(blocked),
        () => withFileLock(join(dir, "SPA-1.md"), async () => "записано", SHORT_LOCK_WAIT),
        { code: "EBUSY" },
      ),
    );

    expect(result).toBe("записано");
  });

  it("на Windows брошенная блокировка снимается, даже если устаревший .lock.break на миг не дали удалить", async () => {
    const dir = await makeTempDir();
    const lock = await writeAbandonedLock(dir);
    await writeFile(`${lock}.break`, "12345");
    const longAgo = new Date(Date.now() - 60 * 60 * 1000);
    await utimes(`${lock}.break`, longAgo, longAgo);

    const result = await asIfOnWindows(() =>
      failingOnce(
        rm,
        (target) => String(target) === `${lock}.break`,
        () => withFileLock(join(dir, "SPA-1.md"), async () => "записано", SHORT_LOCK_WAIT),
        { code: "EBUSY" },
      ),
    );

    expect(result).toBe("записано");
  });

  it("на Windows повтор удаления брошенной блокировки не сносит блокировку, которую тем временем взял другой процесс", async () => {
    const dir = await makeTempDir();
    const lock = await writeAbandonedLock(dir);

    const attempt = asIfOnWindows(() =>
      failingOnce(
        rm,
        (target) => String(target) === lock,
        () => withFileLock(join(dir, "SPA-1.md"), async () => "записано", SHORT_LOCK_WAIT),
        {
          code: "EBUSY",
          meanwhile: () => writeFile(lock, "живая"),
        },
      ),
    );

    await expect(attempt).rejects.toThrow(FileBusyError);
    expect(await readFile(lock, "utf8")).toBe("живая");
  });

  it("брошенную блокировку ломает один ожидающий: второй не вмешивается, пока первый её снимает", async () => {
    const dir = await makeTempDir();
    const lock = await writeAbandonedLock(dir);
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
