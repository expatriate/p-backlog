import { describe, expect, it } from "vitest";
import { folderOf } from "./folders";

describe("папка source", () => {
  it("папка — путь без строки и имени файла", () => {
    expect(folderOf("src/a/b.ts:3")).toBe("src/a");
    expect(folderOf("src/a/b.ts:3:7")).toBe("src/a");
    expect(folderOf("src/a")).toBe("src");
  });

  it("источник с ./ попадает в ту же папку, что путь из git", () => {
    expect(folderOf("./src/a.ts:3")).toBe(folderOf("src/a.ts:3"));
    expect(folderOf("./src/a.ts:3")).toBe("src");
  });

  it("источник с ., .. или // в пути попадает в ту же папку, что путь из git", () => {
    expect(folderOf("src/x/../a.ts:3")).toBe("src");
    expect(folderOf("src/./a.ts:3")).toBe("src");
    expect(folderOf("src//a.ts:3")).toBe("src");
  });

  it("источник-папка со слэшем на конце — сама эта папка, а не её родитель", () => {
    expect(folderOf("src/shared/")).toBe("src/shared");
    expect(folderOf("./src/shared/")).toBe(folderOf("src/shared/"));
    expect(folderOf("./")).toBe(".");
  });

  it("источник, который кончается на . или .., называет папку: саму эту папку или её родителя", () => {
    expect(folderOf("src/.")).toBe("src");
    expect(folderOf("src/shared/.")).toBe("src/shared");
    expect(folderOf("src/shared/..")).toBe("src");
    expect(folderOf("src/shared/../")).toBe("src");
  });

  it("файл в корне репозитория относится к корню, а не к папке с именем файла", () => {
    expect(folderOf("README.md:1")).toBe(".");
    expect(folderOf("./README.md")).toBe(folderOf("README.md"));
  });
});
