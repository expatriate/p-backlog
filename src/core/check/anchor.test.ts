import { describe, expect, it } from "vitest";
import { anchorOf, findMoved, sourceLines, withLines } from "./anchor";

const FILE = ["a", "b", "c  ", "d", "e", "f", "g", "h"].join("\n");

describe("якорь фрагмента", () => {
  it("строка берёт окно ±2, диапазон — себя, края обрезаются", () => {
    expect(sourceLines("src/a.ts:4")).toEqual({ from: 2, to: 6 });
    expect(sourceLines("src/a.ts:10-12")).toEqual({ from: 10, to: 12 });
    expect(sourceLines("src/a.ts:1")).toEqual({ from: 1, to: 3 });
    expect(sourceLines("src/a.ts")).toBeNull();
  });

  it("хвостовые пробелы не меняют якорь, другой текст меняет", () => {
    const same = anchorOf(FILE.replace("c  ", "c"), "x:3");
    expect(anchorOf(FILE, "x:3")).toBe(same);
    expect(anchorOf(FILE.replace("d", "D"), "x:3")).not.toBe(same);
    expect(same).toMatch(/^[0-9a-f]{12}$/);
  });

  it("строка за концом файла — якоря нет", () => {
    expect(anchorOf(FILE, "x:40")).toBeNull();
  });

  it("сдвинутый фрагмент находится, source переносится на ту же величину", () => {
    const anchor = anchorOf(FILE, "x:4") ?? "";
    const shifted = ["new1", "new2", FILE].join("\n");

    expect(findMoved(shifted, "x:4", anchor)).toBe("x:6");
    expect(findMoved(shifted.replace("d", "D"), "x:4", anchor)).toBeNull();
  });

  it("диапазон переносится целиком", () => {
    const anchor = anchorOf(FILE, "x:2-3") ?? "";

    expect(findMoved(["z", FILE].join("\n"), "x:2-3", anchor)).toBe("x:3-4");
    expect(withLines("x:2-3", 5, 6)).toBe("x:5-6");
  });
});
