import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir, writeFiles } from "../core/store/testing/temp-dirs";
import { emptyUsageCache } from "../core/usage/usage-cache";
import { createUsageScanner } from "./usage-scanner";

describe("createUsageScanner", () => {
  it("до первого прохода список расшифровок ещё не получен", async () => {
    const root = await makeTempDir();
    const scanner = createUsageScanner({ root, claudeProjectsDir: join(root, "does-not-exist") });

    expect(scanner.snapshot()).toEqual({ cache: emptyUsageCache(), scan: { listed: false, filesTotal: 0, filesDone: 0, bytesLeft: 0 } });
  });

  it("нет каталога расшифровок — после прохода список получен и пуст", async () => {
    const root = await makeTempDir();
    const scanner = createUsageScanner({ root, claudeProjectsDir: join(root, "does-not-exist") });

    await scanner.scanOnce();

    expect(scanner.snapshot().scan).toEqual({ listed: true, filesTotal: 0, filesDone: 0, bytesLeft: 0 });
  });

  it("повторный вызов scanOnce во время прохода ждёт текущий, а не запускает второй", async () => {
    const root = await makeTempDir();
    const scanner = createUsageScanner({ root, claudeProjectsDir: join(root, "does-not-exist") });

    const first = scanner.scanOnce();
    const second = scanner.scanOnce();

    expect(second).toBe(first);
    await first;
  });

  it("проход с исчерпанным лимитом байт оставляет остаток, следующие дочитывают до конца", async () => {
    const root = await makeTempDir();
    const transcriptsDir = await makeTempDir();
    const line = JSON.stringify({ type: "assistant", timestamp: "2026-09-19T09:00:00.000Z", cwd: "/x", message: { model: "claude-opus-5", usage: { input_tokens: 1, output_tokens: 1 } } });
    await writeFiles(transcriptsDir, { "proj/a.jsonl": `${line}\n`, "proj/b.jsonl": `${line}\n` });
    const scanner = createUsageScanner({ root, claudeProjectsDir: transcriptsDir, byteBudget: line.length + 1 });

    await scanner.scanOnce();
    expect(scanner.snapshot().scan).toMatchObject({ filesTotal: 2, filesDone: 1, bytesLeft: line.length + 1 });

    await scanner.scanOnce();
    expect(scanner.snapshot().scan).toMatchObject({ filesDone: 2, bytesLeft: 0 });
  });
});
