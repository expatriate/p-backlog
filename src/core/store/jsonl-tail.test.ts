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

    expect(result).toMatchObject(await readJsonLines(path, SCHEMA));
  });

  it("последняя строка без перевода строки — результат равен полному чтению до и после дописывания", async () => {
    const root = await makeTempDir();
    const path = join(root, "log.jsonl");
    await writeFile(path, `${JSON.stringify({ n: 1 })}\n${JSON.stringify({ n: 5 })}`);
    const tail = createJsonlTail(path, SCHEMA);
    expect(await tail.read()).toMatchObject(await readJsonLines(path, SCHEMA));

    await appendFile(path, `\n{"n":`);
    expect(await tail.read()).toMatchObject(await readJsonLines(path, SCHEMA));

    await appendFile(path, `6}\n`);
    expect(await tail.read()).toMatchObject(await readJsonLines(path, SCHEMA));
  });

  it("укороченный файл перечитывается целиком", async () => {
    const root = await makeTempDir();
    const path = join(root, "log.jsonl");
    await writeFile(path, `${JSON.stringify({ n: 1 })}\n${JSON.stringify({ n: 2 })}\n${JSON.stringify({ n: 3 })}\n`);
    const tail = createJsonlTail(path, SCHEMA);
    await tail.read();

    await writeFile(path, `${JSON.stringify({ n: 9 })}\n`);
    const result = await tail.read();

    expect(result).toMatchObject({ values: [{ n: 9 }], invalidLines: 0 });
  });

  it("подменённое начало того же размера перечитывается", async () => {
    const root = await makeTempDir();
    const path = join(root, "log.jsonl");
    await writeFile(path, `${JSON.stringify({ n: 1 })}\n${JSON.stringify({ n: 2 })}\n`);
    const tail = createJsonlTail(path, SCHEMA);
    await tail.read();

    await writeFile(path, `${JSON.stringify({ n: 3 })}\n${JSON.stringify({ n: 4 })}\n`);
    await appendFile(path, `${JSON.stringify({ n: 33 })}\n`);
    const result = await tail.read();

    expect(result).toMatchObject(await readJsonLines(path, SCHEMA));
  });

  it("файл, подменённый другим той же длины, читается заново и получает новое поколение", async () => {
    const root = await makeTempDir();
    const path = join(root, "log.jsonl");
    await writeFile(path, `${JSON.stringify({ n: 1 })}\n`);
    const tail = createJsonlTail(path, SCHEMA);
    const before = await tail.read();

    await writeFile(path, `${JSON.stringify({ n: 2 })}\n`);
    const after = await tail.read();

    expect(after).toMatchObject({ values: [{ n: 2 }], length: before.length });
    expect(after.generation).not.toBe(before.generation);
  });

  it("нет файла — пусто, потом появился — читается", async () => {
    const root = await makeTempDir();
    const path = join(root, "log.jsonl");
    const tail = createJsonlTail(path, SCHEMA);

    expect(await tail.read()).toMatchObject({ values: [], invalidLines: 0 });

    await writeFile(path, `${JSON.stringify({ n: 7 })}\n`);
    expect(await tail.read()).toMatchObject({ values: [{ n: 7 }], invalidLines: 0 });
  });

  it("length — сколько байт файла учтено этим чтением", async () => {
    const root = await makeTempDir();
    const path = join(root, "log.jsonl");
    const line = `${JSON.stringify({ n: 1 })}\n`;
    await writeFile(path, line);
    const tail = createJsonlTail(path, SCHEMA);

    expect((await tail.read()).length).toBe(Buffer.byteLength(line));
  });
});
