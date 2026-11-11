import { readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { HOUR_MS, SECOND_MS } from "../model/dates";
import { FileBusyError, withAvailableLocks } from "./file-lock";
import { BLOCKED_RETRIES_TOTAL_MS } from "./fs-utils";
import { failingEvery, failingOnce } from "./testing/fs-failures";
import { SHORT_LOCK_WAIT } from "./testing/lock-wait";
import { withLockFailingOnPathError } from "./testing/locks";
import { asIfOnWindows } from "./testing/platform";
import { makeTempDir } from "./testing/temp-dirs";
import { failOnPathError } from "./testing/path-errors";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readFile: vi.fn(actual.readFile), rm: vi.fn(actual.rm), writeFile: vi.fn(actual.writeFile) };
});

const lockOf = (dir: string) => join(dir, ".SPA-1.md.lock");
const endingWith = (name: string) => (target: unknown) => String(target).endsWith(name);
const anHourAgo = () => new Date(Date.now() - HOUR_MS);
const WAIT_OUTLASTING_BRIEF_REFUSALS = { waitLimitMs: 2 * SECOND_MS };

async function writeAbandoned(path: string): Promise<string> {
  await writeFile(path, "12345");
  const longAgo = anHourAgo();
  await utimes(path, longAgo, longAgo);
  return path;
}

const writeAbandonedLock = (dir: string) => writeAbandoned(lockOf(dir));

describe("блокировка файла", () => {
  it("на Windows блокировка, которую другой процесс на миг не дал удалить, всё равно снимается — следующая правка не ждёт 30 с", async () => {
    const path = join(await makeTempDir(), "SPA-1.md");

    await asIfOnWindows(() => failingOnce(rm, endingWith(".SPA-1.md.lock"), () => withLockFailingOnPathError(path, async () => "первая"), { code: "EBUSY" }));

    expect(await withLockFailingOnPathError(path, async () => "вторая", SHORT_LOCK_WAIT)).toBe("вторая");
  });

  it("на Windows свою блокировку, которую так и не дали удалить, снятие оставляет брошенной: результат записи не подменяется ошибкой", { timeout: BLOCKED_RETRIES_TOTAL_MS + 10 * SECOND_MS }, async () => {
    const path = join(await makeTempDir(), "SPA-1.md");

    const result = await asIfOnWindows(() => failingEvery(rm, endingWith(".SPA-1.md.lock"), () => withLockFailingOnPathError(path, async () => "записано"), { code: "EBUSY" }));

    expect(result).toBe("записано");
  });

  it("сбой снятия одной блокировки набора после действия не подменяет его результат и не оставляет висеть остальные, сбой — в onError", async () => {
    const dir = await makeTempDir();
    const paths = ["T-1.md", "T-2.md"].map((name) => join(dir, name));
    const reported: string[] = [];

    const result = await failingOnce(readFile, endingWith(".T-1.md.lock"), () => withAvailableLocks(paths, async () => "записано", { onErrorAfterPublish: (path) => reported.push(path) }));

    expect(result).toBe("записано");
    expect(reported).toEqual([join(dir, "T-1.md")]);
    expect(await withLockFailingOnPathError(join(dir, "T-2.md"), async () => "свободен", SHORT_LOCK_WAIT)).toBe("свободен");
  });

  it("на Windows постоянный отказ в создании блокировки по истечении предела выдаётся как есть, а не как «занято»", async () => {
    const path = join(await makeTempDir(), "SPA-1.md");

    const attempt = asIfOnWindows(() => failingEvery(writeFile, endingWith(".SPA-1.md.lock"), () => withLockFailingOnPathError(path, async () => "записано", WAIT_OUTLASTING_BRIEF_REFUSALS), { code: "EPERM" }));

    await expect(attempt).rejects.toMatchObject({ code: "EPERM" });
  });

  it("на Windows постоянный отказ в чтении чужой блокировки по истечении предела выдаётся как есть, а не как «занято»", async () => {
    const dir = await makeTempDir();
    await writeFile(lockOf(dir), "другой процесс");

    const attempt = asIfOnWindows(() =>
      failingEvery(readFile, endingWith(".SPA-1.md.lock"), () => withLockFailingOnPathError(join(dir, "SPA-1.md"), async () => "записано", WAIT_OUTLASTING_BRIEF_REFUSALS), { code: "EACCES" }),
    );

    await expect(attempt).rejects.toMatchObject({ code: "EACCES" });
  });

  it("на Windows блокировку, в которой постоянно отказано, набор пропускает, как занятую, — остальные файлы набора всё равно берутся", async () => {
    const dir = await makeTempDir();
    const refused = join(dir, "T-1.md");
    const free = join(dir, "T-2.md");

    const locked = await asIfOnWindows(() =>
      failingEvery(writeFile, endingWith(".T-1.md.lock"), () => withAvailableLocks([refused, free], async (acquired) => acquired, { ...WAIT_OUTLASTING_BRIEF_REFUSALS, onErrorAfterPublish: failOnPathError }), {
        code: "EPERM",
      }),
    );

    expect(locked).toEqual(new Set([free]));
  });

  it("на Windows живая чужая блокировка, которую лишь под конец ожидания на миг не дали прочитать, — это «занято», а не отказ доступа", async () => {
    const dir = await makeTempDir();
    await writeFile(lockOf(dir), "другой процесс");
    const readsRefusedAfter = Date.now() + WAIT_OUTLASTING_BRIEF_REFUSALS.waitLimitMs - 200;
    let refusedReads = 0;

    const attempt = asIfOnWindows(() =>
      failingEvery(
        readFile,
        (target) => endingWith(".SPA-1.md.lock")(target) && Date.now() > readsRefusedAfter,
        () => withLockFailingOnPathError(join(dir, "SPA-1.md"), async () => "записано", WAIT_OUTLASTING_BRIEF_REFUSALS),
        { code: "EACCES", meanwhile: async () => (refusedReads += 1) },
      ),
    );

    await expect(attempt).rejects.toThrow(FileBusyError);
    expect(refusedReads).toBeGreaterThan(0);
  });

  it("блокировка, брошенная упавшим процессом, не держит файл вечно", async () => {
    const dir = await makeTempDir();
    await writeAbandonedLock(dir);

    expect(await withLockFailingOnPathError(join(dir, "SPA-1.md"), async () => "записано")).toBe("записано");
  });

  it.each([
    { blocked: ".SPA-1.md.lock", staleBreaker: false },
    { blocked: ".SPA-1.md.lock.break", staleBreaker: false },
    { blocked: ".SPA-1.md.lock.break", staleBreaker: true },
  ])("на Windows брошенная блокировка снимается, даже если $blocked на миг не дали удалить (чужой устаревший .lock.break: $staleBreaker)", async ({ blocked, staleBreaker }) => {
    const dir = await makeTempDir();
    const lock = await writeAbandonedLock(dir);
    if (staleBreaker) await writeAbandoned(`${lock}.break`);

    const result = await asIfOnWindows(() => failingOnce(rm, endingWith(blocked), () => withLockFailingOnPathError(join(dir, "SPA-1.md"), async () => "записано", SHORT_LOCK_WAIT), { code: "EBUSY" }));

    expect(result).toBe("записано");
  });

  it("оставленный кем-то .lock.break старше нескольких секунд не мешает снять брошенную блокировку", async () => {
    const dir = await makeTempDir();
    const lock = await writeAbandonedLock(dir);
    await writeFile(`${lock}.break`, "12345");
    const secondsAgo = new Date(Date.now() - 5 * SECOND_MS);
    await utimes(`${lock}.break`, secondsAgo, secondsAgo);

    expect(await withLockFailingOnPathError(join(dir, "SPA-1.md"), async () => "записано", SHORT_LOCK_WAIT)).toBe("записано");
  });

  it("на Windows брошенная блокировка, которую не дают удалить, держит не дольше предела ожидания и даёт «занято», а не сбой", async () => {
    const dir = await makeTempDir();
    const lock = await writeAbandonedLock(dir);
    const waitLimitMs = 200;
    const startedAt = Date.now();

    const attempt = asIfOnWindows(() =>
      failingEvery(
        rm,
        (target) => target === lock,
        () => withLockFailingOnPathError(join(dir, "SPA-1.md"), async () => "записано", { waitLimitMs }),
        { code: "EBUSY" },
      ),
    );

    await expect(attempt).rejects.toThrow(FileBusyError);
    expect(Date.now() - startedAt).toBeLessThan(waitLimitMs + SECOND_MS);
  });

  it("на Windows блокировка, которую в этот миг удаляют, при создании даёт EPERM — это занято, а не сбой", async () => {
    const dir = await makeTempDir();

    const deletePending = { code: "EPERM" };

    const result = await asIfOnWindows(() =>
      failingOnce(
        writeFile,
        endingWith(".SPA-1.md.lock"),
        () => failingOnce(readFile, endingWith(".SPA-1.md.lock"), () => withLockFailingOnPathError(join(dir, "SPA-1.md"), async () => "записано", SHORT_LOCK_WAIT), deletePending),
        deletePending,
      ),
    );

    expect(result).toBe("записано");
  });

  it("на Windows следующая попытка снять брошенную блокировку не сносит блокировку, которую тем временем взял другой процесс", async () => {
    const dir = await makeTempDir();
    const lock = await writeAbandonedLock(dir);

    const attempt = asIfOnWindows(() =>
      failingOnce(
        rm,
        (target) => String(target) === lock,
        () => withLockFailingOnPathError(join(dir, "SPA-1.md"), async () => "записано", SHORT_LOCK_WAIT),
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

    await expect(withLockFailingOnPathError(join(dir, "SPA-1.md"), async () => "записано", SHORT_LOCK_WAIT)).rejects.toThrow(FileBusyError);
    expect(await readFile(lock, "utf8")).toBe("12345");
  });

  it("долгая работа под блокировкой продлевает её: ожидающий не считает её брошенной", async () => {
    const dir = await makeTempDir();
    const path = join(dir, "SPA-1.md");
    const lock = lockOf(dir);
    const longAgo = anHourAgo();
    vi.useFakeTimers({ toFake: ["setInterval"] });
    try {
      await withLockFailingOnPathError(path, async () => {
        await utimes(lock, longAgo, longAgo);
        vi.advanceTimersByTime(30_000);
        await vi.waitFor(async () => expect((await stat(lock)).mtimeMs).toBeGreaterThan(longAgo.getTime()));

        await expect(withLockFailingOnPathError(path, async () => "перехвачено", SHORT_LOCK_WAIT)).rejects.toThrow(FileBusyError);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("снятие не удаляет чужую блокировку, занявшую место нашей", async () => {
    const dir = await makeTempDir();
    const lock = lockOf(dir);

    await withLockFailingOnPathError(join(dir, "SPA-1.md"), async () => {
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
    const locked = await withAvailableLocks([...busy.map((name) => join(dir, name)), ...free], async (acquired) => acquired, { waitLimitMs, onErrorAfterPublish: failOnPathError });

    expect(locked).toEqual(new Set(free));
    expect(Date.now() - startedAt).toBeLessThan(busy.length * waitLimitMs);
  });
});
