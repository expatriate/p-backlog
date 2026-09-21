import { describe, expect, it } from "vitest";
import { makeTempDir } from "../store/testing/temp-dirs";
import { makeGraph } from "./testing/make-graph";
import { openCodeGraph } from "./code-graph";

const FILE = { path: "src/upload.ts", hash: "a".repeat(64) };

async function repoWithGraph(options?: { schemaVersion?: number; repoRoot?: string }): Promise<string> {
  const repo = await makeTempDir();
  await makeGraph(
    repo,
    [
      {
        ...FILE,
        symbols: [
          { name: "uploadFile", kind: "Function", from: 10, to: 40 },
          { name: "retry", kind: "Function", from: 20, to: 25 },
        ],
      },
    ],
    options,
  );
  return repo;
}

describe("openCodeGraph", () => {
  it("на строке внутри вложенного символа отдаёт его, а не объемлющий", async () => {
    const graph = openCodeGraph(await repoWithGraph());

    expect(graph?.symbolAt("src/upload.ts", 22, FILE.hash)).toEqual({ name: "retry", kind: "Function", from: 20, to: 25 });
    expect(graph?.symbolAt("src/upload.ts", 12, FILE.hash)).toEqual({ name: "uploadFile", kind: "Function", from: 10, to: 40 });
    graph?.close();
  });

  it("не отвечает про файл, который изменился после сборки графа", async () => {
    const graph = openCodeGraph(await repoWithGraph());

    expect(graph?.symbolAt("src/upload.ts", 22, "b".repeat(64))).toBeNull();
    graph?.close();
  });

  it("строка вне символов и неизвестный файл дают null", async () => {
    const graph = openCodeGraph(await repoWithGraph());

    expect(graph?.symbolAt("src/upload.ts", 5, FILE.hash)).toBeNull();
    expect(graph?.symbolAt("src/other.ts", 22, FILE.hash)).toBeNull();
    graph?.close();
  });

  it("чужая схема, чужой репозиторий и отсутствие базы дают null вместо графа", async () => {
    expect(openCodeGraph(await repoWithGraph({ schemaVersion: 99 }))).toBeNull();
    expect(openCodeGraph(await repoWithGraph({ repoRoot: "/другой/репозиторий" }))).toBeNull();
    expect(openCodeGraph(await makeTempDir())).toBeNull();
  });
});
