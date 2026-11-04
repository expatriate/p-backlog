import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir, writeFiles } from "../src/core/store/testing/temp-dirs";
import { runCheckScript } from "./check-script";

const run = (cwd: string) => runCheckScript("check-css-hover.mjs", cwd);

describe("check-css-hover", () => {
  it(":hover вне @media (hover: hover) — код 1, путь и строка правила; внутри, даже в @container, — не ошибка", async () => {
    const root = await makeTempDir();
    await writeFiles(root, {
      "src/web/ui/Button.module.css": [
        ".button {\n  color: red;\n}\n",
        "@media (hover: hover) {\n  .button:hover {\n    color: blue;\n  }\n}\n",
        "@container (max-width: 480px) {\n  .button:not(.x, .y):hover {\n    color: green;\n  }\n}\n",
        ".link:focus-visible,\n.link:hover {\n  outline: 1px;\n}\n",
      ].join(""),
    });

    const result = run(root);

    expect(result.status).toBe(1);
    expect(result.stdout.trim().split("\n")).toEqual([`${join("src", "web", "ui", "Button.module.css")}:10`, `${join("src", "web", "ui", "Button.module.css")}:14`]);
  });

  it(":HOVER в другом регистре и :hover в @scope — тоже нарушения; @MEDIA (HOVER: HOVER) — тоже ворота", async () => {
    const root = await makeTempDir();
    await writeFiles(root, {
      "src/web/ui/Card.module.css": [".a:HOVER {\n  color: red;\n}\n", "@scope (.card:hover) {\n  .b {\n    color: red;\n  }\n}\n", "@MEDIA (HOVER: HOVER) {\n  .c:hover {\n    color: blue;\n  }\n}\n"].join(""),
    });

    const result = run(root);

    expect(result.stdout.trim().split("\n")).toEqual([`${join("src", "web", "ui", "Card.module.css")}:1`, `${join("src", "web", "ui", "Card.module.css")}:4`]);
  });

  it("каталога нет или в нём нечего проверять — гейт падает, а не зеленеет вхолостую", async () => {
    const missing = await makeTempDir();
    const empty = await makeTempDir();
    await writeFiles(empty, { "src/web/ui/Button.tsx": "export {};\n" });

    const [withoutRoot, withoutFiles] = [run(missing), run(empty)];

    expect([withoutRoot.status, withoutRoot.stderr]).toEqual([1, expect.stringContaining("ENOENT")]);
    expect([withoutFiles.status, withoutFiles.stderr]).toEqual([1, expect.stringContaining("no files to check")]);
  });

  it("все :hover под @media (hover: hover) — код 0; сами условия @media (hover:hover) и @supports selector(:hover) — не правила с :hover", async () => {
    const root = await makeTempDir();
    await writeFiles(root, {
      "src/web/ui/Chip.module.css": "@media (hover: hover) {\n  @container (max-width: 480px) {\n    .chip:hover {\n      color: blue;\n    }\n  }\n}\n",
      "src/web/ui/Tag.module.css": "@media (hover:hover) {\n  @supports selector(:hover) {\n    .tag:hover {\n      color: blue;\n    }\n  }\n}\n",
    });

    expect(run(root).status).toBe(0);
  });
});
