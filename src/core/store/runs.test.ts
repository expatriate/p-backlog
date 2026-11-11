import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { withFile } from "./fs-utils";
import { appendRun, RUNS_FILE, trimRuns, trimRunsWhenStale, type CliRun } from "./runs";
import { readRuns } from "./testing/runs";
import { makeTempDir, writeFiles } from "./testing/temp-dirs";
import { failOnPathError } from "./testing/path-errors";
import { failingOnce } from "./testing/fs-failures";
import { failingLockRelease } from "./testing/locks";

vi.mock("./fs-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fs-utils")>();
  return { ...actual, withFile: vi.fn(actual.withFile), readTextOrNull: vi.fn(actual.readTextOrNull) };
});

const RUN: CliRun = { at: "2026-09-20T10:00:00+03:00", command: "list", cwd: "/tmp/repo", ms: 12, rssMb: 80.5, exitCode: 0 };

describe("журнал запусков CLI", () => {
  it("дописывает записи и читает их обратно", async () => {
    const root = await makeTempDir();

    await appendRun(root, RUN, failOnPathError);
    await appendRun(root, { ...RUN, command: "hook stop", exitCode: 1 }, failOnPathError);

    expect((await readFile(join(root, RUNS_FILE), "utf8")).trim().split("\n")).toHaveLength(2);
    expect(await readRuns(root)).toEqual([RUN, { ...RUN, command: "hook stop", exitCode: 1 }]);
  });

  it("создаёт каталог, если его ещё нет", async () => {
    const root = join(await makeTempDir(), "nested");

    await appendRun(root, RUN, failOnPathError);

    expect(await readRuns(root)).toEqual([RUN]);
  });

  it("пропускает битые строки при чтении", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { [RUNS_FILE]: `не json\n${JSON.stringify({ command: "list" })}\n${JSON.stringify(RUN)}\n` });

    expect(await readRuns(root)).toEqual([RUN]);
  });

  it("дописывание после последней строки без перевода строки не склеивает запуски", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { [RUNS_FILE]: JSON.stringify(RUN) });

    await appendRun(root, { ...RUN, command: "stats" }, failOnPathError);

    expect(await readRuns(root)).toEqual([RUN, { ...RUN, command: "stats" }]);
  });

  it("нет файла — пустой список", async () => {
    const root = await makeTempDir();

    expect(await readRuns(root)).toEqual([]);
  });

  it("бросает ошибку записи, а не проглатывает её", async () => {
    const root = await makeTempDir();
    await mkdir(join(root, RUNS_FILE));

    await expect(appendRun(root, RUN, failOnPathError)).rejects.toThrow();
  });

  it.skipIf(process.platform === "win32")("сбой синхронизации каталога после первой записи запуска не выдаёт записанный запуск за незаписанный, сбой — в onError", async () => {
    const root = await makeTempDir();
    const reported: string[] = [];

    await failingOnce(
      withFile,
      (path) => path === root,
      () => appendRun(root, RUN, (path) => reported.push(path)),
    );

    expect(await readRuns(root)).toEqual([RUN]);
    expect(reported).toEqual([join(root, RUNS_FILE)]);
  });

  it("сбой снятия блокировки после записи запуска не выдаёт записанный запуск за незаписанный, сбой — в onError", async () => {
    const root = await makeTempDir();
    const reported: string[] = [];

    await failingLockRelease(join(root, RUNS_FILE), () => appendRun(root, RUN, (path) => reported.push(path)));

    expect(await readRuns(root)).toEqual([RUN]);
    expect(reported).toEqual([join(root, RUNS_FILE)]);
  });

  it("сбой снятия блокировки после обрезки не выдаёт обрезанный журнал за необрезанный, сбой — в onError", async () => {
    const root = await makeTempDir();
    await appendRun(root, { ...RUN, at: "2026-05-01T10:00:00+03:00", command: "old" }, failOnPathError);
    await appendRun(root, RUN, failOnPathError);
    const reported: string[] = [];

    const removed = await failingLockRelease(join(root, RUNS_FILE), () => trimRuns(root, { now: new Date("2026-09-20T12:00:00+03:00"), onError: (path) => reported.push(path) }));

    expect(removed).toBe(1);
    expect(await readRuns(root)).toEqual([RUN]);
    expect(reported).toEqual([join(root, RUNS_FILE)]);
  });

  it("обрезка убирает запуски старше окна хранения, файл без старых строк не переписывает", async () => {
    const root = await makeTempDir();
    const old = { ...RUN, at: "2026-05-01T10:00:00+03:00", command: "old" };
    await appendRun(root, old, failOnPathError);
    await appendRun(root, RUN, failOnPathError);
    const now = new Date("2026-09-20T12:00:00+03:00");

    expect(await trimRuns(root, { now, onError: failOnPathError })).toBe(1);
    expect(await readRuns(root)).toEqual([RUN]);
    expect(await trimRuns(root, { now, onError: failOnPathError })).toBe(0);
  });

  it("запуск 60 дней от роду переживает обрезку — это ещё внутри окна недель", async () => {
    const root = await makeTempDir();
    const recentEnough = { ...RUN, at: "2026-07-22T12:00:00+03:00", command: "sixty-days" };
    await appendRun(root, recentEnough, failOnPathError);
    const now = new Date("2026-09-20T12:00:00+03:00");

    expect(await trimRuns(root, { now, onError: failOnPathError })).toBe(0);
    expect(await readRuns(root)).toEqual([recentEnough]);
  });

  it("запуск чуть старше 12 недель переживает обрезку — окно хранения с запасом, сдвиг часов не срежет первую неделю графика", async () => {
    const root = await makeTempDir();
    const edgeOfView = { ...RUN, at: "2026-06-24T12:00:00+03:00", command: "eighty-eight-days" };
    await appendRun(root, edgeOfView, failOnPathError);

    expect(await trimRuns(root, { now: new Date("2026-09-20T12:00:00+03:00"), onError: failOnPathError })).toBe(0);
    expect(await readRuns(root)).toEqual([edgeOfView]);
  });

  it("запуск, дописанный во время обрезки, не теряется", async () => {
    const root = await makeTempDir();
    await appendRun(root, { ...RUN, at: "2026-05-01T10:00:00+03:00", command: "old" }, failOnPathError);

    await Promise.all([trimRuns(root, { now: new Date("2026-09-20T12:00:00+03:00"), onError: failOnPathError }), appendRun(root, RUN, failOnPathError)]);

    expect(await readRuns(root)).toEqual([RUN]);
  });

  it("без сервера журнал не растёт: CLI обрезает его, когда старейший запуск вышел за окно хранения с запасом в сутки", async () => {
    const root = await makeTempDir();
    await appendRun(root, { ...RUN, at: "2026-06-20T15:00:00+03:00", command: "old" }, failOnPathError);
    await appendRun(root, RUN, failOnPathError);

    expect(await trimRunsWhenStale(root, { now: new Date("2026-09-20T12:00:00+03:00"), onError: failOnPathError })).toBe(0);
    expect(await trimRunsWhenStale(root, { now: new Date("2026-09-21T12:00:00+03:00"), onError: failOnPathError })).toBe(1);
    expect(await readRuns(root)).toEqual([RUN]);
    expect(await trimRunsWhenStale(await makeTempDir(), { now: new Date(), onError: failOnPathError })).toBe(0);
  });

  it("неразобранная первая строка тоже ведёт к обрезке, иначе без сервера журнал рос бы вечно", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { [RUNS_FILE]: `{"at":"обрыв записи\n${JSON.stringify(RUN)}\n` });
    const now = new Date("2026-09-20T12:00:00+03:00");

    expect(await trimRunsWhenStale(root, { now, onError: failOnPathError })).toBe(1);
    expect(await readFile(join(root, RUNS_FILE), "utf8")).toBe(`${JSON.stringify(RUN)}\n`);
    expect(await trimRunsWhenStale(root, { now, onError: failOnPathError })).toBe(0);
  });
});
