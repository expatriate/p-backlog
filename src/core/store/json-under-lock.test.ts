import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { updateJsonUnderLock } from "./json-under-lock";
import { SHORT_LOCK_WAIT } from "./testing/lock-wait";
import { failingLockRelease, withLockFailingOnPathError } from "./testing/locks";
import { makeTempDir } from "./testing/temp-dirs";
import { failOnPathError } from "./testing/path-errors";

vi.mock("./fs-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fs-utils")>();
  return { ...actual, readTextOrNull: vi.fn(actual.readTextOrNull) };
});

const countsSchema = z.record(z.string(), z.number());

describe("updateJsonUnderLock", () => {
  it.each(["не json", "[1, 2]"])("битый или чужой файл %j заменяется результатом обновления, а не теряет запись вызывающего", async (content) => {
    const path = join(await makeTempDir(), "counts.json");
    await writeFile(path, content);

    const outcome = await updateJsonUnderLock(path, countsSchema, {}, (current) => ({ ...current, hooks: 1 }), { onErrorAfterPublish: failOnPathError });

    expect(outcome).toBe("written");
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ hooks: 1 });
  });

  it("сбой снятия блокировки после записи не выдаёт записанное за незаписанное, сбой — в onError", async () => {
    const path = join(await makeTempDir(), "counts.json");
    await writeFile(path, '{"hooks":1}');
    const reported: string[] = [];

    const outcome = await failingLockRelease(path, () => updateJsonUnderLock(path, countsSchema, {}, (current) => ({ ...current, hooks: 2 }), { onErrorAfterPublish: (target) => reported.push(target) }));

    expect(outcome).toBe("written");
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ hooks: 2 });
    expect(reported).toEqual([path]);
  });

  it("занятый другим процессом файл не меняется, а вызывающий получает FileBusyError", async () => {
    const path = join(await makeTempDir(), "counts.json");
    await writeFile(path, '{"hooks":1}');

    await withLockFailingOnPathError(path, async () => {
      await expect(updateJsonUnderLock(path, countsSchema, {}, (current) => ({ ...current, hooks: 2 }), { ...SHORT_LOCK_WAIT, onErrorAfterPublish: failOnPathError })).rejects.toMatchObject({
        name: "FileBusyError",
        seconds: 0.05,
      });
    });

    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ hooks: 1 });
  });
});
