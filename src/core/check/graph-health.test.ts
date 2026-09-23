import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { makeGraph } from "../graph/testing/make-graph";
import { makeTask } from "../model/testing/make-task";
import { makeTempDir, writeFiles } from "../store/testing/temp-dirs";
import { graphHealth } from "./graph-health";

const CODE = ["export function one() {", "  return 1;", "}", ""].join("\n");
const SYMBOLS = [{ name: "one", kind: "Function", from: 1, to: 3 }];
const FILES = ["src/a.ts", "src/b.ts", "src/c.ts"];

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const tasks = FILES.map((path, index) => makeTask({ id: `SPA-${index + 1}`, source: `${path}:2` }));

async function repoWithGraph(editedAfterBuild: readonly string[]): Promise<string> {
  const repo = await makeTempDir();
  await writeFiles(repo, Object.fromEntries(FILES.map((path) => [path, editedAfterBuild.includes(path) ? `${CODE}// правка\n` : CODE])));
  await makeGraph(repo, FILES.map((path) => ({ path, hash: sha(CODE), symbols: SYMBOLS })));
  return repo;
}

describe("graphHealth", () => {
  it("граф, от которого ушла большая часть файлов с задачами, — устаревший, и символов он почти не находит", async () => {
    const repo = await repoWithGraph(["src/a.ts", "src/b.ts"]);

    expect(graphHealth(repo, tasks)).toEqual({ state: "stale", pinned: 3, resolved: 1 });
  });

  it("одна свежая правка при актуальном графе не делает его устаревшим", async () => {
    const repo = await repoWithGraph(["src/a.ts"]);

    expect(graphHealth(repo, tasks)).toEqual({ state: "fresh", pinned: 3, resolved: 2 });
  });

  it("без графа и с графом чужой версии — отдельные состояния, задачи с source всё равно посчитаны", async () => {
    const withoutGraph = await makeTempDir();
    const foreign = await makeTempDir();
    await makeGraph(foreign, [], { schemaVersion: 99 });

    expect(graphHealth(withoutGraph, tasks)).toEqual({ state: "none", pinned: 3, resolved: 0 });
    expect(graphHealth(foreign, tasks)).toEqual({ state: "unreadable", pinned: 3, resolved: 0 });
    expect(graphHealth(undefined, tasks)).toEqual({ state: "none", pinned: 3, resolved: 0 });
  });
});
