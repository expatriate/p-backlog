import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readSignalsShown, SIGNALS_SHOWN_FILE, writeSignalsShown } from "./signals-shown";
import { makeTempDir } from "./testing/temp-dirs";

describe("показанные тревоги", () => {
  it("пишутся и читаются, битый или чужой файл — пусто", async () => {
    const dir = await makeTempDir();

    expect(await readSignalsShown(dir)).toEqual({});
    await writeSignalsShown(dir, { "urgent-stale": "2026-09-18" });
    expect(await readSignalsShown(dir)).toEqual({ "urgent-stale": "2026-09-18" });
    await writeFile(join(dir, SIGNALS_SHOWN_FILE), "не json");
    expect(await readSignalsShown(dir)).toEqual({});
    await writeFile(join(dir, SIGNALS_SHOWN_FILE), "[1, 2]");
    expect(await readSignalsShown(dir)).toEqual({});
  });
});
