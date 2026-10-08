import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTask } from "../../core/model/testing/make-task";
import { EPIC_TONES, epicTones, toneOf } from "./epic-tone";

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

const epic = (id: string, projectId = "spa") => makeTask({ id, projectId, type: "epic" });

describe("тоны эпиков", () => {
  it("раздаются по возрастанию номера внутри проекта", () => {
    const tones = epicTones([epic("SPA-10"), epic("SPA-2"), epic("TI-5", "ti"), makeTask({ id: "SPA-3" })]);

    expect([tones.get("SPA-2"), tones.get("SPA-10"), tones.get("TI-5")]).toEqual([1, 2, 1]);
    expect(tones.has("SPA-3")).toBe(false);
  });

  it("после пятого эпика тоны идут по кругу", () => {
    const tones = epicTones(["SPA-1", "SPA-2", "SPA-3", "SPA-4", "SPA-5", "SPA-6"].map((id) => epic(id)));

    expect(tones.get("SPA-5")).toBe(5);
    expect(tones.get("SPA-6")).toBe(1);
  });

  it("задача берёт тон своего эпика, без эпика или с ненайденным — без тона", () => {
    const tones = epicTones([epic("SPA-1")]);

    expect(toneOf(epic("SPA-1"), tones)).toBe(1);
    expect(toneOf(makeTask({ id: "SPA-2", epic: "SPA-1" }), tones)).toBe(1);
    expect(toneOf(makeTask({ id: "SPA-3" }), tones)).toBeUndefined();
    expect(toneOf(makeTask({ id: "SPA-4", epic: "SPA-99" }), tones)).toBeUndefined();
  });
});
