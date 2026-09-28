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
    expect(folderOf("./src/shared/")).toBe("src");
  });

  it("файл в корне репозитория относится к корню, а не к папке с именем файла", () => {
    expect(folderOf("README.md:1")).toBe(".");
    expect(folderOf("./README.md")).toBe(folderOf("README.md"));
  });
});
