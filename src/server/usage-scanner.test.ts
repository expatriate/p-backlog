import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir } from "../core/store/testing/temp-dirs";
import { emptyUsageCache } from "../core/usage/usage-cache";
import { createUsageScanner } from "./usage-scanner";

describe("createUsageScanner", () => {
  it("нет каталога расшифровок — пустой снимок ещё до первого прохода", async () => {
    const root = await makeTempDir();
    const scanner = createUsageScanner({ root, claudeProjectsDir: join(root, "does-not-exist"), home: root });

    expect(scanner.snapshot()).toEqual({ cache: emptyUsageCache(), scan: { filesTotal: 0, filesDone: 0, bytesLeft: 0 } });
  });

  it("повторный вызов scanOnce во время прохода ждёт текущий, а не запускает второй", async () => {
    const root = await makeTempDir();
    const scanner = createUsageScanner({ root, claudeProjectsDir: join(root, "does-not-exist"), home: root });

    const first = scanner.scanOnce([]);
    const second = scanner.scanOnce([]);

    expect(second).toBe(first);
    await first;
  });
});
