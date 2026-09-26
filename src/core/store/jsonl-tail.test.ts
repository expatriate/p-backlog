import { appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { readJsonLines } from "./fs-utils";
import { createJsonlTail } from "./jsonl-tail";
import { makeTempDir } from "./testing/temp-dirs";

const SCHEMA = z.object({ n: z.number() });

describe("createJsonlTail", () => {
  it("дописанные строки — результат равен полному чтению", async () => {
    const root = await makeTempDir();
    const path = join(root, "log.jsonl");
    await writeFile(path, `${JSON.stringify({ n: 1 })}\n${JSON.stringify({ n: 2 })}\n`);
    const tail = createJsonlTail(path, SCHEMA);
    await tail.read();

    await appendFile(path, `${JSON.stringify({ n: 3 })}\nне json\n${JSON.stringify({ n: 4 })}\n`);
    const result = await tail.read();

    expect(result).toEqual(await readJsonLines(path, SCHEMA));
  });

  it("недописанная строка учитывается после дописывания", async () => {
    const root = await makeTempDir();
    const path = join(root, "log.jsonl");
    await writeFile(path, `${JSON.stringify({ n: 1 })}\n`);
    const tail = createJsonlTail(path, SCHEMA);
    await tail.read();

    await appendFile(path, JSON.stringify({ n: 5 }));
    expect((await tail.read()).values).toEqual([{ n: 1 }]);

    await appendFile(path, "\n");
    expect((await tail.read()).values).toEqual([{ n: 1 }, { n: 5 }]);
  });

  it("укороченный файл перечитывается целиком", async () => {
    const root = await makeTempDir();
    const path = join(root, "log.jsonl");
    await writeFile(path, `${JSON.stringify({ n: 1 })}\n${JSON.stringify({ n: 2 })}\n${JSON.stringify({ n: 3 })}\n`);
    const tail = createJsonlTail(path, SCHEMA);
    await tail.read();

    await writeFile(path, `${JSON.stringify({ n: 9 })}\n`);
    const result = await tail.read();

    expect(result).toEqual({ values: [{ n: 9 }], invalidLines: 0 });
  });

  it("подменённое начало того же размера перечитывается", async () => {
    const root = await makeTempDir();
    const path = join(root, "log.jsonl");
    await writeFile(path, `${JSON.stringify({ n: 1 })}\n${JSON.stringify({ n: 2 })}\n`);
    const tail = createJsonlTail(path, SCHEMA);
    await tail.read();

    await writeFile(path, `${JSON.stringify({ n: 11 })}\n${JSON.stringify({ n: 22 })}\n`);
    await appendFile(path, `${JSON.stringify({ n: 33 })}\n`);
    const result = await tail.read();

    expect(result).toEqual(await readJsonLines(path, SCHEMA));
  });

  it("нет файла — пусто, потом появился — читается", async () => {
    const root = await makeTempDir();
    const path = join(root, "log.jsonl");
    const tail = createJsonlTail(path, SCHEMA);

    expect(await tail.read()).toEqual({ values: [], invalidLines: 0 });

    await writeFile(path, `${JSON.stringify({ n: 7 })}\n`);
    expect(await tail.read()).toEqual({ values: [{ n: 7 }], invalidLines: 0 });
  });

  it("length() — сколько байт файла учтено чтением", async () => {
    const root = await makeTempDir();
    const path = join(root, "log.jsonl");
    const line = `${JSON.stringify({ n: 1 })}\n`;
    await writeFile(path, line);
    const tail = createJsonlTail(path, SCHEMA);

    expect(tail.length()).toBe(0);
    await tail.read();
    expect(tail.length()).toBe(Buffer.byteLength(line));
  });
});
