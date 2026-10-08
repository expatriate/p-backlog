import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir, writeFiles } from "../src/core/store/testing/temp-dirs";
import { runCheckScript } from "./check-script";

const run = (cwd: string) => runCheckScript("check-css-contracts.mjs", cwd);

describe("check-css-contracts", () => {
  it("переменная, прочитанная в модуле и нигде не объявленная, — код 1, путь, строка и имя в выводе", async () => {
    const root = await makeTempDir();
    await writeFiles(root, {
      "src/web/styles/tokens.css": ":root {\n  --ink: white;\n}\n",
      "src/web/list/Table.module.css": ".row {\n  color: var(--ink);\n  overflow: var(--main-overflow, auto);\n}\n",
    });

    const result = run(root);

    expect(result.status).toBe(1);
    expect(result.stdout.trim()).toBe(`${join("src", "web", "list", "Table.module.css")}:3: --main-overflow`);
  });

  it("переменные из tokens.css, из того же модуля и из inline-стиля компонента — код 0", async () => {
    const root = await makeTempDir();
    await writeFiles(root, {
      "src/web/styles/tokens.css": ":root {\n  --ink: white;\n  --footer: 0px;\n}\n@property --angle {\n  syntax: '<angle>';\n  inherits: false;\n  initial-value: 0deg;\n}\n",
      "src/web/ui/Swatch.module.css": ".dot {\n  --size: 8px;\n  width: var(--size);\n  color: var(--ink);\n  background: var(--swatch);\n}\n",
      "src/web/ui/Swatch.tsx": 'export const Swatch = () => <i style={{ "--swatch": "red" }} />;\n',
      "src/web/ui/footer.ts": 'document.documentElement.style.setProperty("--footer", "1px");\n',
      "src/web/ui/Dial.module.css": ".dial {\n  --modal: 0;\n  rotate: var(--angle);\n}\n",
      "src/web/ui/Dial.tsx": 'export const isModal = (element: Element) => getComputedStyle(element).getPropertyValue("--modal") === "1";\n',
    });

    const result = run(root);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("имя переменной в TypeScript без объявления в tokens.css — код 1", async () => {
    const root = await makeTempDir();
    await writeFiles(root, {
      "src/web/styles/tokens.css": ":root {\n  --ink: white;\n}\n",
      "src/web/ui/panel.ts": 'const flag = getComputedStyle(element).getPropertyValue("--modal");\nconst stroke = "var(--ink)";\n',
      "src/web/ui/chart.ts": 'const fill = "var(--chart-bar)";\n',
    });

    const result = run(root);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`${join("src", "web", "ui", "panel.ts")}:1: --modal`);
    expect(result.stdout).toContain(`${join("src", "web", "ui", "chart.ts")}:1: --chart-bar`);
    expect(result.stdout).not.toContain("--ink");
  });

  it("модуль и компонент, один читает, другой называет переменную, но никто её не объявляет, — код 1 в обоих файлах", async () => {
    const root = await makeTempDir();
    await writeFiles(root, {
      "src/web/styles/tokens.css": ":root {\n  --ink: white;\n}\n",
      "src/web/ui/Popover.module.css": ".panel {\n  width: var(--ghost);\n}\n",
      "src/web/ui/Popover.tsx": 'const margin = getComputedStyle(menu).getPropertyValue("--ghost");\n',
    });

    const result = run(root);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`${join("src", "web", "ui", "Popover.module.css")}:2: --ghost`);
    expect(result.stdout).toContain(`${join("src", "web", "ui", "Popover.tsx")}:1: --ghost`);
  });
});
