import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir, writeFiles } from "../src/core/store/testing/temp-dirs";
import { runCheckScript } from "./check-script";

const run = (cwd: string) => runCheckScript("check-cyrillic.mjs", cwd);

async function rootWithCleanFilesAnd(files: Record<string, string>) {
  const root = await makeTempDir();
  await writeFiles(root, { "scripts/gate.mjs": "export {};\n", "src/plain.ts": "export {};\n", ...files });
  return root;
}

describe("check-cyrillic", () => {
  it("кириллица в обычном файле — код 1 и путь в выводе", async () => {
    const root = await rootWithCleanFilesAnd({ "src/x.ts": 'const a = "привет";\n' });

    const result = run(root);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`${join("src", "x.ts")}:1`);
  });

  it("кириллица в стилях и JSON тоже ловится", async () => {
    const root = await rootWithCleanFilesAnd({ "src/x.module.css": '.a::after { content: "привет"; }\n', "src/x.json": '{ "a": "привет" }\n' });

    const result = run(root);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`${join("src", "x.module.css")}:1`);
    expect(result.stdout).toContain(`${join("src", "x.json")}:1`);
  });

  it("та же кириллица в messages.ru.ts и в тесте — код 0", async () => {
    const root = await rootWithCleanFilesAnd({
      "src/x/messages.ru.ts": 'const a = "привет";\n',
      "src/x.test.ts": 'const a = "привет";\n',
    });

    const result = run(root);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("каталог ядра src/core/messages/ru.ts пропускается по пути, а не по имени файла", async () => {
    const root = await rootWithCleanFilesAnd({ "src/core/messages/ru.ts": 'const a = "привет";\n' });

    const result = run(root);

    expect(result.status).toBe(0);
  });
});
