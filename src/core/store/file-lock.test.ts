import { utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { withFileLock } from "./file-lock";
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

});
