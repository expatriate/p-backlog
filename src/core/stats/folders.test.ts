import { describe, expect, it } from "vitest";
import { folderOf } from "./folders";

describe("папка source", () => {
  it("папка — путь без строки и имени файла, файл в корне — имя файла", () => {
    expect(folderOf("src/a/b.ts:3")).toBe("src/a");
    expect(folderOf("src/a/b.ts:3:7")).toBe("src/a");
    expect(folderOf("README.md:1")).toBe("README.md");
    expect(folderOf("src/a")).toBe("src");
  });
});
