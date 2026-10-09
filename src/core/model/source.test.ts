import { describe, expect, it } from "vitest";
import { namesFolder, sourcePath } from "./source";

describe("source", () => {
  it("обратная косая черта в source даёт тот же путь, что и косая — как в выводе git", () => {
    expect(sourcePath("src\\web\\..\\a.ts:3")).toBe("src/a.ts");
    expect(namesFolder("src\\web\\")).toBe(true);
    expect(namesFolder("src\\web\\a.ts:3")).toBe(false);
  });

  it.each([
    ["\\\\server\\share\\x\\..\\y.ts:1", "//server/share/y.ts"],
    ["C:/x/../../a.ts", "C:/a.ts"],
    ["c:\\x\\..\\..\\a.ts", "c:/a.ts"],
    ["/x/../../a.ts", "/a.ts"],
  ])("корень пути (UNC, диск, /) сохраняется, а «..» не поднимается выше него: %s", (source, path) => {
    expect(sourcePath(source)).toBe(path);
  });
});
