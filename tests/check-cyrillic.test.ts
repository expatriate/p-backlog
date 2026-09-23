import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir, writeFiles } from "../src/core/store/testing/temp-dirs";

const script = join(import.meta.dirname, "../scripts/check-cyrillic.mjs");

function run(cwd: string) {
  return spawnSync("node", [script], { cwd, encoding: "utf8" });
}

describe("check-cyrillic", () => {
  it("кириллица в обычном файле — код 1 и путь в выводе", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "src/x.ts": 'const a = "привет";\n' });

    const result = run(root);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("src/x.ts:1");
  });

  it("та же кириллица в messages.ru.ts и в тесте — код 0", async () => {
    const root = await makeTempDir();
    await writeFiles(root, {
      "src/x/messages.ru.ts": 'const a = "привет";\n',
      "src/x.test.ts": 'const a = "привет";\n',
    });

    const result = run(root);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("каталог ядра src/core/messages/ru.ts пропускается по пути, а не по имени файла", async () => {
    const root = await makeTempDir();
    await writeFiles(root, { "src/core/messages/ru.ts": 'const a = "привет";\n' });

    const result = run(root);

    expect(result.status).toBe(0);
  });
});
