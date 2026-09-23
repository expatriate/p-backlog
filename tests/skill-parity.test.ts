import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const commands = (text: string) => [...new Set(text.match(/backlog [a-z]+/g) ?? [])].sort();
const sections = (text: string) => (text.match(/^#{2,3} /gm) ?? []).length;

describe("два варианта скилла", () => {
  it("одинаковые команды и число разделов", async () => {
    const ru = await readFile("skill/backlog/SKILL.md", "utf8");
    const en = await readFile("skill/backlog-en/SKILL.md", "utf8");
    expect(commands(en)).toEqual(commands(ru));
    expect(sections(en)).toBe(sections(ru));
  });
});
