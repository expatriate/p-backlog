import { describe, expect, it } from "vitest";
import { anchorOf, findMoved, isAnchorFor, snippetOf } from "./anchor";

const FILE = ["const alpha = createAlpha();", "const beta = createBeta();", "const gamma = createGamma();  ", "const delta = createDelta();", "const epsilon = 5;", "const zeta = 6;", "const eta = 7;", "const theta = 8;"].join("\n");

describe("якорь фрагмента", () => {
  it("строка — окно ±2 с обрезкой у краёв, диапазон — сам диапазон", () => {
    expect(anchorOf(FILE, "x:4")).toMatch(/^[0-9a-f]{12}@2-6$/);
    expect(anchorOf(FILE, "x:1")).toMatch(/@1-3$/);
    expect(anchorOf(`${FILE}\n`, "x:8")).toMatch(/@6-8$/);
    expect(anchorOf(FILE, "x:2-3")).toMatch(/@2-3$/);
  });

  it("строки за концом файла нет — якоря нет; путь без строки — якоря нет", () => {
    expect(anchorOf(`${FILE}\n`, "x:9")).toBeNull();
    expect(anchorOf(FILE, "x")).toBeNull();
  });

  it("хвостовые пробелы не меняют якорь, другой текст меняет", () => {
    const anchor = anchorOf(FILE, "x:3");
    expect(anchorOf(FILE.replace("createGamma();  ", "createGamma();"), "x:3")).toBe(anchor);
    expect(anchorOf(FILE.replace("createDelta", "createDelta2"), "x:3")).not.toBe(anchor);
  });

  it("якорь относится к своему source: после ручной правки строки он устаревший", () => {
    const anchor = anchorOf(FILE, "x:4") ?? "";
    expect(isAnchorFor(anchor, "x:4")).toBe(true);
    expect(isAnchorFor(anchor, "x:7")).toBe(false);
    expect(isAnchorFor(anchorOf(FILE, "x:1") ?? "", "x:1")).toBe(true);
  });

  it("сдвинутый фрагмент находится, в том числе у начала и конца файла", () => {
    const shifted = ["// one", "// two", FILE].join("\n");

    expect(findMoved(shifted, "x:4", anchorOf(FILE, "x:4") ?? "")).toBe("x:6");
    expect(findMoved(shifted, "x:1", anchorOf(FILE, "x:1") ?? "")).toBe("x:3");
    expect(findMoved(shifted, "x:8", anchorOf(FILE, "x:8") ?? "")).toBe("x:10");
    expect(findMoved(["z", FILE].join("\n"), "x:2-3", anchorOf(FILE, "x:2-3") ?? "")).toBe("x:3-4");
  });

  it("изменённый, повторяющийся или бессодержательный фрагмент не переносится", () => {
    const anchor = anchorOf(FILE, "x:4") ?? "";
    expect(findMoved(["z", FILE.replace("createDelta", "changed")].join("\n"), "x:4", anchor)).toBeNull();
    expect(findMoved(["z", FILE, FILE].join("\n"), "x:4", anchor)).toBeNull();

    const braces = ["}", "", "}", "", "}", "x"].join("\n");
    expect(findMoved(["y", braces].join("\n"), "x:3", anchorOf(braces, "x:3") ?? "")).toBeNull();
  });

  it("фрагмент для агента — первая и последняя строка ±5 с номерами", () => {
    const lines = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`).join("\n");

    expect(snippetOf(lines, "x:10")?.split("\n")).toHaveLength(11);
    expect(snippetOf(lines, "x:10-12")?.split("\n")[0]).toBe("    5│ line 5");
    expect(snippetOf(lines, "x:10-12")?.split("\n").at(-1)).toBe("   17│ line 17");
    expect(snippetOf(lines, "x:40")).toBeUndefined();
  });
});
