import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTask } from "../model/testing/make-task";
import type { Task } from "../model/types";
import { openCodeGraph } from "../graph/code-graph";
import { makeGraph } from "../graph/testing/make-graph";
import { gitCommitAll, makeGitRepo, makeTempDir, writeFiles } from "../store/testing/temp-dirs";
import type { Candidate } from "./candidates";
import { duplicateCandidates } from "./candidates";
import { filterBySymbol, symbolLookup, symbolNames } from "./symbol-filter";
import type { CodeGraph } from "../graph/code-graph";
import { diffsSince } from "./repo-facts";

const SYMBOLS = [
  { name: "uploadFile", kind: "Function", from: 1, to: 3 },
  { name: "retry", kind: "Function", from: 5, to: 7 },
];

function body(uploadMark: string, retryMark: string): string {
  return [`export function uploadFile() {`, `  return "${uploadMark}";`, "}", "", "export function retry() {", `  return "${retryMark}";`, "}", ""].join("\n");
}

async function repoWithChange({ inSymbol }: { inSymbol: boolean }): Promise<string> {
  const repo = await makeGitRepo(await makeTempDir(), "spa");
  await writeFiles(repo, { "src/upload.ts": body("v1", "v1") });
  gitCommitAll(repo, "Начало", "2026-09-10T10:00:00+03:00");
  await writeFile(join(repo, "src/upload.ts"), inSymbol ? body("v2", "v1") : body("v1", "v2"));
  gitCommitAll(repo, "Правка", "2026-09-12T10:00:00+03:00");
  const hash = createHash("sha256")
    .update(await readFile(join(repo, "src/upload.ts")))
    .digest("hex");
  await makeGraph(repo, [{ path: "src/upload.ts", hash, symbols: SYMBOLS }]);
  return repo;
}

const byId = (...tasks: Task[]) => new Map(tasks.map((item) => [item.id, item]));
const task = makeTask({ id: "SPA-1", source: "src/upload.ts:2", created: "2026-09-11T10:00:00+03:00" });
const candidate: Candidate = { kind: "source-changed", task: { id: "SPA-1", title: task.title }, path: "src/upload.ts", commits: [], uncommitted: false };

describe("filterBySymbol", () => {
  it("правка в другом символе того же файла убирает кандидата", async () => {
    const repo = await repoWithChange({ inSymbol: false });
    const graph = openCodeGraph(repo);

    expect(await filterBySymbol([candidate], byId(task), diffsSince(repo), symbolLookup(repo, graph))).toEqual([]);
    graph?.close();
  });

  it("правка внутри символа задачи оставляет кандидата и помечает его", async () => {
    const repo = await repoWithChange({ inSymbol: true });
    const graph = openCodeGraph(repo);

    expect(await filterBySymbol([candidate], byId(task), diffsSince(repo), symbolLookup(repo, graph))).toEqual([{ ...candidate, bySymbol: true }]);
    graph?.close();
  });

  it("без графа кандидат остаётся в том же сценарии", async () => {
    const repo = await repoWithChange({ inSymbol: false });

    expect(await filterBySymbol([candidate], byId(task), diffsSince(repo), symbolLookup(repo, null))).toEqual([candidate]);
  });

  it("файл изменился после сборки графа — кандидат остаётся", async () => {
    const repo = await repoWithChange({ inSymbol: false });
    const graph = openCodeGraph(repo);
    await writeFile(join(repo, "src/upload.ts"), body("v3", "v3"));

    expect(await filterBySymbol([candidate], byId(task), diffsSince(repo), symbolLookup(repo, graph))).toEqual([candidate]);
    graph?.close();
  });

  it("правка внутри объявленного диапазона source, но в соседнем символе, кандидата оставляет", async () => {
    const repo = await repoWithChange({ inSymbol: false });
    const graph = openCodeGraph(repo);
    const spanning = makeTask({ id: "SPA-9", source: "src/upload.ts:2-6", created: "2026-09-11T10:00:00+03:00" });
    const spanningCandidate: Candidate = { kind: "source-changed", task: { id: "SPA-9", title: spanning.title }, path: "src/upload.ts", commits: [], uncommitted: false };

    expect(await filterBySymbol([spanningCandidate], byId(spanning), diffsSince(repo), symbolLookup(repo, graph))).toEqual([{ ...spanningCandidate, bySymbol: true }]);
    graph?.close();
  });

  it("путь репозитория с хвостовым слешем не выключает фильтр", async () => {
    const repo = await repoWithChange({ inSymbol: false });

    expect(await filterBySymbol([candidate], byId(task), diffsSince(`${repo}/`), symbolLookup(`${repo}/`, openCodeGraph(`${repo}/`)))).toEqual([]);
  });

  it("кандидатов других видов не трогает", async () => {
    const repo = await repoWithChange({ inSymbol: false });
    const graph = openCodeGraph(repo);
    const missing: Candidate = { kind: "source-missing", task: { id: "SPA-2", title: "Задача SPA-2" }, path: "src/gone.ts" };

    expect(await filterBySymbol([missing], byId(task), diffsSince(repo), symbolLookup(repo, graph))).toEqual([missing]);
    graph?.close();
  });
});

describe("symbolNames", () => {
  it("символ каждой задачи спрашивается у графа один раз, а не на каждую пару", async () => {
    const repo = await repoWithChange({ inSymbol: false });
    let asked = 0;
    const counting: CodeGraph = {
      symbolAt: () => {
        asked++;
        return { qualifiedName: "src/upload.ts::uploadFile", from: 1, to: 3 };
      },
      close: () => undefined,
    };
    const tasks = ["SPA-1", "SPA-2", "SPA-3"].map((id, index) => makeTask({ id, title: `Задача ${id}`, source: `src/upload.ts:${index + 1}` }));

    const duplicates = duplicateCandidates(tasks, symbolNames(symbolLookup(repo, counting)));

    expect(duplicates).toHaveLength(3);
    expect(asked).toBe(3);
  });

  it("одноимённые методы разных классов одного файла — разные символы, а не дубль", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    const text = ["class A {", "  render() {", "    return 1;", "  }", "}", "class B {", "  render() {", "    return 2;", "  }", "}", ""].join("\n");
    await writeFiles(repo, { "src/view.ts": text });
    const hash = createHash("sha256").update(text).digest("hex");
    await makeGraph(repo, [
      {
        path: "src/view.ts",
        hash,
        symbols: [
          { name: "render", owner: "A", kind: "Function", from: 2, to: 4 },
          { name: "render", owner: "B", kind: "Function", from: 7, to: 9 },
        ],
      },
    ]);
    const graph = openCodeGraph(repo);
    const tasks = [makeTask({ id: "SPA-1", title: "Отрисовка A", source: "src/view.ts:3" }), makeTask({ id: "SPA-2", title: "Счётчик B", source: "src/view.ts:8" })];

    expect(duplicateCandidates(tasks, symbolNames(symbolLookup(repo, graph)))).toEqual([]);
    graph?.close();
  });
});
