import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { withFileLock } from "./file-lock";
import { updateJsonUnderLock } from "./json-under-lock";
import { SHORT_LOCK_WAIT } from "./testing/lock-wait";
import { makeTempDir } from "./testing/temp-dirs";

const countsSchema = z.record(z.string(), z.number());

describe("updateJsonUnderLock", () => {
  it.each(["не json", "[1, 2]"])("битый или чужой файл %j заменяется результатом обновления, а не теряет запись вызывающего", async (content) => {
    const path = join(await makeTempDir(), "counts.json");
    await writeFile(path, content);

    const outcome = await updateJsonUnderLock(path, countsSchema, {}, (current) => ({ ...current, hooks: 1 }));

    expect(outcome).toBe("written");
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ hooks: 1 });
  });

  it("занятый другим процессом файл не меняется, а вызывающий получает FileBusyError", async () => {
    const path = join(await makeTempDir(), "counts.json");
    await writeFile(path, '{"hooks":1}');

    await withFileLock(path, async () => {
      await expect(updateJsonUnderLock(path, countsSchema, {}, (current) => ({ ...current, hooks: 2 }), SHORT_LOCK_WAIT)).rejects.toMatchObject({ name: "FileBusyError", seconds: 0.05 });
    });

    expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ hooks: 1 });
  });
});
