import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appendRun, readRuns, RUNS_FILE, trimRuns, type CliRun } from "./runs";
import { makeTempDir, writeFiles } from "./testing/temp-dirs";

const RUN: CliRun = { at: "2026-09-20T10:00:00+03:00", command: "list", cwd: "/tmp/repo", ms: 12, rssMb: 80.5, exitCode: 0 };

describe("журнал запусков CLI", () => {
  it("дописывает записи и читает их обратно", async () => {
    const root = await makeTempDir();

    await appendRun(root, RUN);
    await appendRun(root, { ...RUN, command: "hook stop", exitCode: 1 });

    expect((await readFile(join(root, RUNS_FILE), "utf8")).trim().split("\n")).toHaveLength(2);
    expect(await readRuns(root)).toEqual([RUN, { ...RUN, command: "hook stop", exitCode: 1 }]);
  });

  it("создаёт каталог, если его ещё нет", async () => {
    const root = join(await makeTempDir(), "nested");

    await appendRun(root, RUN);

    expect(await readRuns(root)).toEqual([RUN]);
  });

  it("пропускает битые строки при чтении", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { [RUNS_FILE]: `не json\n${JSON.stringify({ command: "list" })}\n${JSON.stringify(RUN)}\n` });

    expect(await readRuns(root)).toEqual([RUN]);
  });

  it("нет файла — пустой список", async () => {
    const root = await makeTempDir();

    expect(await readRuns(root)).toEqual([]);
  });

  it("бросает ошибку записи, а не проглатывает её", async () => {
    const root = await makeTempDir();
    await mkdir(join(root, RUNS_FILE));

    await expect(appendRun(root, RUN)).rejects.toThrow();
  });

  it("обрезка оставляет запуски последних 30 дней, файл без старых строк не переписывает", async () => {
    const root = await makeTempDir();
    const old = { ...RUN, at: "2026-08-01T10:00:00+03:00", command: "old" };
    await appendRun(root, old);
    await appendRun(root, RUN);
    const now = new Date("2026-09-20T12:00:00+03:00");

    expect(await trimRuns(root, now)).toBe(1);
    expect(await readRuns(root)).toEqual([RUN]);
    expect(await trimRuns(root, now)).toBe(0);
  });

  it("запуск, дописанный во время обрезки, не теряется", async () => {
    const root = await makeTempDir();
    await appendRun(root, { ...RUN, at: "2026-08-01T10:00:00+03:00", command: "old" });

    await Promise.all([trimRuns(root, new Date("2026-09-20T12:00:00+03:00")), appendRun(root, RUN)]);

    expect(await readRuns(root)).toEqual([RUN]);
  });
});
