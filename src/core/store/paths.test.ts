import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveBacklogRoot } from "./paths";

describe("resolveBacklogRoot", () => {
  it("относительный BACKLOG_DIR становится абсолютным: иначе служба с другим рабочим каталогом читает другой беклог", () => {
    expect(resolveBacklogRoot({ BACKLOG_DIR: "bl" }, "/home/u")).toBe(join(process.cwd(), "bl"));
  });
});
