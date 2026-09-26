import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { makeTempDir, writeFiles } from "../core/store/testing/temp-dirs";
import { emptyUsageCache, readUsageCache } from "../core/usage/usage-cache";
import { serverRu } from "./messages.ru";
import { CATCH_UP_DELAY_MS, createUsageScanner, type UsageScannerOptions } from "./usage-scanner";

function scannerOf(options: Omit<UsageScannerOptions, "messages" | "warn">, warn: (line: string) => void = () => undefined) {
  return createUsageScanner({ ...options, messages: async () => serverRu, warn });
}

describe("createUsageScanner", () => {
  it("до первого прохода список расшифровок ещё не получен", async () => {
    const root = await makeTempDir();
    const scanner = scannerOf({ root, claudeProjectsDir: join(root, "does-not-exist") });

    expect(scanner.snapshot()).toEqual({ cache: emptyUsageCache(), scan: { listed: false, filesTotal: 0, filesDone: 0, bytesLeft: 0 }, revision: 0 });
  });

  it("нет каталога расшифровок — после прохода список получен и пуст", async () => {
    const root = await makeTempDir();
    const scanner = scannerOf({ root, claudeProjectsDir: join(root, "does-not-exist") });

    await scanner.scanOnce();

    expect(scanner.snapshot().scan).toEqual({ listed: true, filesTotal: 0, filesDone: 0, bytesLeft: 0 });
  });

  it("повторный вызов scanOnce во время прохода ждёт текущий, а не запускает второй", async () => {
    const root = await makeTempDir();
    const scanner = scannerOf({ root, claudeProjectsDir: join(root, "does-not-exist") });

    const first = scanner.scanOnce();
    const second = scanner.scanOnce();

    expect(second).toBe(first);
    await first;
  });

  it("stop дожидается уже начатого прохода — к моменту, когда он разрешится, кеш уже записан", async () => {
    const root = await makeTempDir();
    const transcriptsDir = await makeTempDir();
    const line = JSON.stringify({ type: "assistant", timestamp: "2026-09-19T09:00:00.000Z", cwd: "/x", message: { model: "claude-opus-5", usage: { input_tokens: 1, output_tokens: 1 } } });
    await writeFiles(transcriptsDir, { "proj/a.jsonl": `${line}\n` });
    const scanner = scannerOf({ root, claudeProjectsDir: transcriptsDir });

    void scanner.scanOnce();
    await scanner.stop();

    const cache = await readUsageCache(root);
    expect(Object.keys(cache.files)).toContain(join(transcriptsDir, "proj/a.jsonl"));
  });

  it("проход с исчерпанным лимитом байт оставляет остаток, следующие дочитывают до конца", async () => {
    const root = await makeTempDir();
    const transcriptsDir = await makeTempDir();
    const line = JSON.stringify({ type: "assistant", timestamp: "2026-09-19T09:00:00.000Z", cwd: "/x", message: { model: "claude-opus-5", usage: { input_tokens: 1, output_tokens: 1 } } });
    await writeFiles(transcriptsDir, { "proj/a.jsonl": `${line}\n`, "proj/b.jsonl": `${line}\n` });
    const scanner = scannerOf({ root, claudeProjectsDir: transcriptsDir, byteBudget: line.length + 1 });

    await scanner.scanOnce();
    expect(scanner.snapshot().scan).toMatchObject({ filesTotal: 2, filesDone: 1, bytesLeft: line.length + 1 });

    await scanner.scanOnce();
    expect(scanner.snapshot().scan).toMatchObject({ filesDone: 2, bytesLeft: 0 });
  });

  it("revision растёт после прохода с новыми данными и не растёт после прохода без изменений", async () => {
    const root = await makeTempDir();
    const transcriptsDir = await makeTempDir();
    const line = JSON.stringify({ type: "assistant", timestamp: "2026-09-19T09:00:00.000Z", cwd: "/x", message: { model: "claude-opus-5", usage: { input_tokens: 1, output_tokens: 1 } } });
    await writeFiles(transcriptsDir, { "proj/a.jsonl": `${line}\n` });
    const scanner = scannerOf({ root, claudeProjectsDir: transcriptsDir });
    const before = scanner.snapshot().revision;

    await scanner.scanOnce();
    const afterFirstPass = scanner.snapshot().revision;
    expect(afterFirstPass).toBeGreaterThan(before);

    await scanner.scanOnce();
    expect(scanner.snapshot().revision).toBe(afterFirstPass);
  });

  it("revision растёт, когда вклад удалённой расшифровки выпадает из окна истории, хотя новых байт не было", async () => {
    const root = await makeTempDir();
    const transcriptsDir = await makeTempDir();
    const filePath = join(transcriptsDir, "proj", "a.jsonl");
    const hookLine = JSON.stringify({ type: "user", isMeta: true, timestamp: "2026-09-19T08:59:00.000Z", cwd: "/x", message: { content: "Stop hook feedback:\nБеклог p-backlog: тест" } });
    const assistantLine = JSON.stringify({ type: "assistant", timestamp: "2026-09-19T09:00:00.000Z", cwd: "/x", message: { model: "claude-opus-5", usage: { input_tokens: 1, output_tokens: 1 } } });
    await writeFiles(transcriptsDir, { "proj/a.jsonl": `${hookLine}\n${assistantLine}\n` });
    let now = new Date("2026-09-19T12:00:00Z");
    const scanner = scannerOf({ root, claudeProjectsDir: transcriptsDir, now: () => now });
    await scanner.scanOnce();

    await rm(filePath);
    now = new Date("2026-10-10T12:00:00Z");
    await scanner.scanOnce();
    const stillWithinWindow = scanner.snapshot().revision;
    expect(Object.keys(scanner.snapshot().cache.files)).toContain(filePath);

    now = new Date("2026-12-18T12:00:00Z");
    await scanner.scanOnce();

    expect(scanner.snapshot().revision).toBeGreaterThan(stillWithinWindow);
    expect(scanner.snapshot().cache.files).toEqual({});
  });

  it("упавший проход не оставляет сканер в догоняющем режиме", async () => {
    const root = await makeTempDir();
    const transcriptsDir = await makeTempDir();
    const line = JSON.stringify({ type: "assistant", timestamp: "2026-09-19T09:00:00.000Z", cwd: "/x", message: { model: "claude-opus-5", usage: { input_tokens: 1, output_tokens: 1 } } });
    await writeFiles(transcriptsDir, { "proj/a.jsonl": `${line}\n`, "proj/b.jsonl": `${line}\n` });
    const failures: string[] = [];
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const schedule = vi.spyOn(globalThis, "setTimeout");
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const delays = () => schedule.mock.calls.map(([, delay]) => delay);
    const scanner = scannerOf({ root, claudeProjectsDir: transcriptsDir, byteBudget: line.length + 1, intervalMs: 60_000 }, (failure) => failures.push(failure));

    scanner.start();
    await scanner.scanOnce();

    expect(delays().at(-1)).toBe(CATCH_UP_DELAY_MS);

    await rm(root, { recursive: true });
    await writeFile(root, "");
    await vi.advanceTimersByTimeAsync(CATCH_UP_DELAY_MS);
    await scanner.scanOnce();
    await scanner.stop();

    expect(failures).toHaveLength(1);
    expect(delays().at(-1)).toBe(60_000);
  });
});
