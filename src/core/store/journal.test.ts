import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createdEvent } from "../journal/events";
import { makeTask } from "../model/testing/make-task";
import { appendJournal, JOURNAL_FILE, readJournal, readJournals } from "./journal";
import { makeTempDir, writeFiles } from "./testing/temp-dirs";

const NOW = new Date(2026, 8, 18, 12, 0, 0);

describe("файл журнала", () => {
  it("дописывает события строками и читает их обратно", async () => {
    const dir = await makeTempDir();

    await appendJournal(dir, [createdEvent(makeTask({ id: "SPA-1" }), NOW, "cli")]);
    await appendJournal(dir, [createdEvent(makeTask({ id: "SPA-2" }), NOW, "cli")]);

    expect((await readFile(join(dir, JOURNAL_FILE), "utf8")).trim().split("\n")).toHaveLength(2);
    const journal = await readJournal(dir, "spa");
    expect(journal.events.map((event) => event.task)).toEqual(["SPA-1", "SPA-2"]);
    expect(journal.invalidLines).toBe(0);
  });

  it("пропускает и считает строки, которые не разбираются", async () => {
    const dir = await makeTempDir();
    await writeFiles(dir, { [JOURNAL_FILE]: `не json\n{"kind":"status"}\n${JSON.stringify(createdEvent(makeTask({ id: "SPA-1" }), NOW, "cli"))}\n` });

    const journal = await readJournal(dir, "spa");

    expect(journal.events).toHaveLength(1);
    expect(journal.invalidLines).toBe(2);
  });

  it("нет файла — пустой журнал", async () => {
    const dir = await makeTempDir();

    expect(await readJournal(dir, "spa")).toEqual({ projectId: "spa", events: [], invalidLines: 0 });
  });

  it("ошибка записи не бросает, но зовёт onError", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, JOURNAL_FILE));
    const failures: unknown[] = [];

    await expect(appendJournal(dir, [createdEvent(makeTask({ id: "SPA-1" }), NOW, "cli")], (path, error) => failures.push([path, error]))).resolves.toBeUndefined();

    expect(failures).toHaveLength(1);
  });

  it("без onError ошибка записи видна в stderr с путём журнала", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, JOURNAL_FILE));
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});

    await appendJournal(dir, [createdEvent(makeTask({ id: "SPA-1" }), NOW, "cli")]);

    expect(stderr.mock.calls.flat().join("\n")).toContain(join(dir, JOURNAL_FILE));
    stderr.mockRestore();
  });

  it("читает журналы нескольких проектов", async () => {
    const root = await makeTempDir();
    await mkdir(join(root, "spa"), { recursive: true });
    await appendJournal(join(root, "spa"), [createdEvent(makeTask({ id: "SPA-1" }), NOW, "cli")]);

    const journals = await readJournals(root, ["spa", "ti"]);

    expect(journals.map(({ projectId, events }) => [projectId, events.length])).toEqual([
      ["spa", 1],
      ["ti", 0],
    ]);
  });
});
