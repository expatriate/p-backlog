import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveBacklogRoot } from "./paths";

describe("resolveBacklogRoot", () => {
  it("относительный BACKLOG_DIR становится абсолютным: иначе служба с другим рабочим каталогом читает другой беклог", () => {
    expect(resolveBacklogRoot({ BACKLOG_DIR: "bl" }, "/home/u")).toBe(join(process.cwd(), "bl"));
  });

  it("BACKLOG_DIR вида ~\\bl из Windows ведёт в домашний каталог, а не в каталог «~\\bl» рядом с процессом", () => {
    expect(resolveBacklogRoot({ BACKLOG_DIR: "~\\bl" }, "/home/u")).toBe(resolve("/home/u", "bl"));
  });
});
