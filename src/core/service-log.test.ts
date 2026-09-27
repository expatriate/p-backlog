import { open, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir } from "./store/testing/temp-dirs";
import { SERVICE_LOG_KEPT_BYTES, SERVICE_LOG_LIMIT_BYTES, launchdLogPath, serviceLogToTrim, trimLogFile } from "./service-log";

function bigLog(lines: number): string {
  return Array.from({ length: lines }, (_, index) => `line ${String(index + 1).padStart(5, "0")} ${"filler ".repeat(10)}\n`).join("");
}

describe("trimLogFile", () => {
  it("лог больше 1 МБ обрезается до хвоста с целой первой строкой", async () => {
    const root = await makeTempDir();
    const path = join(root, "p-backlog.log");
    const text = bigLog(20000);
    await writeFile(path, text);
    expect((await stat(path)).size).toBeGreaterThan(SERVICE_LOG_LIMIT_BYTES);

    const trimmed = await trimLogFile(path, SERVICE_LOG_LIMIT_BYTES, SERVICE_LOG_KEPT_BYTES);

    expect(trimmed).toBe(true);
    expect((await stat(path)).size).toBeLessThanOrEqual(SERVICE_LOG_KEPT_BYTES);
    const after = await readFile(path, "utf8");
    expect(text.endsWith(after)).toBe(true);
    expect(after.startsWith("line ")).toBe(true);
    expect(after.trimEnd().split("\n").at(-1)).toBe(text.trimEnd().split("\n").at(-1));
  });

  it("лог меньше порога не трогается", async () => {
    const root = await makeTempDir();
    const path = join(root, "p-backlog.log");
    const text = bigLog(10);
    await writeFile(path, text);

    const trimmed = await trimLogFile(path, SERVICE_LOG_LIMIT_BYTES, SERVICE_LOG_KEPT_BYTES);

    expect(trimmed).toBe(false);
    expect(await readFile(path, "utf8")).toBe(text);
  });

  it("дописывающий процесс продолжает писать сразу за хвостом", async () => {
    const root = await makeTempDir();
    const path = join(root, "p-backlog.log");
    await writeFile(path, bigLog(20000));
    const appender = await open(path, "a");

    await trimLogFile(path, SERVICE_LOG_LIMIT_BYTES, SERVICE_LOG_KEPT_BYTES);
    await appender.write("after\n");
    await appender.close();

    const after = await readFile(path, "utf8");
    expect(after.endsWith("after\n")).toBe(true);
    expect(after).not.toContain("\0");
  });

  it("лог без строки-разделителя внутри хвоста обрезается до пустого файла", async () => {
    const root = await makeTempDir();
    const path = join(root, "p-backlog.log");
    await writeFile(path, "x".repeat(SERVICE_LOG_LIMIT_BYTES + 1));

    const trimmed = await trimLogFile(path, SERVICE_LOG_LIMIT_BYTES, SERVICE_LOG_KEPT_BYTES);

    expect(trimmed).toBe(true);
    expect(await readFile(path, "utf8")).toBe("");
  });

  it("отсутствующий файл не считается требующим обрезки", async () => {
    const root = await makeTempDir();

    expect(await trimLogFile(join(root, "no-such.log"), SERVICE_LOG_LIMIT_BYTES, SERVICE_LOG_KEPT_BYTES)).toBe(false);
  });
});

describe("serviceLogToTrim", () => {
  it("на macOS возвращает путь к логу launchd, на других платформах — null", () => {
    expect(serviceLogToTrim("darwin", "/Users/ann")).toBe(launchdLogPath("/Users/ann"));
    expect(serviceLogToTrim("linux", "/home/ann")).toBeNull();
    expect(serviceLogToTrim("win32", "C:/Users/ann")).toBeNull();
  });
});
