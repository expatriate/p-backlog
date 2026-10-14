import { describe, expect, it } from "vitest";
import { namesFolder, sourcePath } from "./source";

describe("source", () => {
  it("путь — часть source до номера строки", () => {
    expect(sourcePath("src/upload/client.ts:88")).toBe("src/upload/client.ts");
    expect(sourcePath("src/a.ts:10-20")).toBe("src/a.ts");
    expect(sourcePath("README.md")).toBe("README.md");
  });

  it("путь нормализуется: без ./ в начале и / в конце", () => {
    expect(sourcePath("./src/a.ts:3")).toBe("src/a.ts");
    expect(sourcePath("src/shared/")).toBe("src/shared");
    expect(sourcePath("./src/shared/")).toBe("src/shared");
  });

  it("путь схлопывается: . и // пропадают, .. снимает папку перед собой, а выходящий за начало пути остаётся", () => {
    expect(sourcePath(".//src/x/../a.ts:3")).toBe("src/a.ts");
    expect(sourcePath("src/../../shared/a.ts")).toBe("../shared/a.ts");
    expect(sourcePath("/repo/src/../a.ts")).toBe("/repo/a.ts");
  });

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
