import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ISOLATED_GIT_ENV, makeTempDir } from "../store/testing/temp-dirs";
import { baseText, currentLine, parseHunks, type Hunk } from "./diff-hunks";

async function hunksBetween(before: string, after: string): Promise<Hunk[]> {
  const dir = await makeTempDir();
  await writeFile(join(dir, "before"), before);
  await writeFile(join(dir, "after"), after);
  let diff = "";
  try {
    execFileSync("git", ["diff", "--no-index", "--no-color", "before", "after"], { cwd: dir, env: { ...process.env, ...ISOLATED_GIT_ENV }, encoding: "utf8" });
  } catch (error) {
    diff = (error as { stdout: string }).stdout;
  }
  const hunks = parseHunks(diff);
  if (hunks === null) throw new Error("diff не разобран");
  return hunks;
}

const numbered = (count: number) => Array.from({ length: count }, (_, index) => `строка ${index + 1}`);

describe("перевод строк по гункам diff", () => {
  const before = `${numbered(40).join("\n")}\n`;
  const lines = numbered(40);
  const after = `${["вставка 1", "вставка 2", ...lines.slice(0, 14), "замена 15", ...lines.slice(15, 29), ...lines.slice(32)].join("\n")}\n`;

  it("строка ниже вставок и удалений сдвигается на их разницу, изменённая — остаётся на своём месте", async () => {
    const hunks = await hunksBetween(before, after);

    expect(currentLine(hunks, 1)).toBe(3);
    expect(currentLine(hunks, 15)).toBe(17);
    expect(currentLine(hunks, 20)).toBe(22);
    expect(currentLine(hunks, 31)).toBe(32);
    expect(currentLine(hunks, 40)).toBe(39);
  });

  it("версия файла до правок восстанавливается из текущего текста и гунков", async () => {
    const hunks = await hunksBetween(before, after);

    expect(baseText(hunks, after)).toBe(before);
  });
});
