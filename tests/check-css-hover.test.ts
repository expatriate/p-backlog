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

  it("все :hover под @media (hover: hover) — код 0", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "src/web/ui/Chip.module.css": "@media (hover: hover) {\n  @container (max-width: 480px) {\n    .chip:hover {\n      color: blue;\n    }\n  }\n}\n" });

    expect(run(root).status).toBe(0);
  });
});
