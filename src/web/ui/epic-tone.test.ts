import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EPIC_TONES } from "./epic-tone";

const STYLES_DIR = join(import.meta.dirname, "../styles");
const tokens = readFileSync(join(STYLES_DIR, "tokens.css"), "utf8");
const base = readFileSync(join(STYLES_DIR, "base.css"), "utf8");

const TONE_PARTS = ["line", "ink", "soft"];

const numbersIn = (source: string, pattern: RegExp) => new Set([...source.matchAll(pattern)].map((match) => Number(match[1])));

describe("палитра тонов эпиков в CSS", () => {
  it("токены и правила [data-epic-tone] есть ровно для тонов из списка в коде", () => {
    expect(numbersIn(tokens, /--epic-tone-(\d+)-/g)).toEqual(new Set(EPIC_TONES));
    expect(numbersIn(base, /\[data-epic-tone="(\d+)"\]/g)).toEqual(new Set(EPIC_TONES));
  });

  it.each(EPIC_TONES)("тон %i: правило берёт линию, текст и фон своего тона", (tone) => {
    const rule = base.match(new RegExp(`\\[data-epic-tone="${tone}"\\]\\s*\\{([^}]*)\\}`))?.[1] ?? "";
    for (const part of TONE_PARTS) {
      expect(tokens).toContain(`--epic-tone-${tone}-${part}:`);
      expect(rule).toContain(`--tone-${part}: var(--epic-tone-${tone}-${part});`);
    }
  });
});
