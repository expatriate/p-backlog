import { describe, expect, it } from "vitest";
import type { TaskOrigin } from "../journal/events";
import { gitCheckout, gitCommitAll, gitMergeSquash, gitRebaseMerge, gitShortHead, makeGitRepo, makeTempDir, writeFiles } from "../store/testing/temp-dirs";
import { awaitingMerge } from "./awaiting-merge";

const LINES = Array.from({ length: 40 }, (_, index) => `строка ${index + 1}`);

const withLines = (replaced: Record<number, string>) => `${LINES.map((line, index) => replaced[index + 1] ?? line).join("\n")}\n`;

async function featureOfTwoCommits(): Promise<{ repo: string; feat: TaskOrigin; next: TaskOrigin }> {
  const repo = await makeGitRepo(await makeTempDir(), "spa");
  await writeFiles(repo, { "src/a.ts": "a1\n", "src/b.ts": "b1\n", "src/c.ts": "c1\n" });
  gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
  gitCheckout(repo, "next", { create: true });
  await writeFiles(repo, { "src/c.ts": "c2\n" });
  gitCommitAll(repo, "Ещё не слитая правка c", "2026-09-10T09:00:00+03:00");
  const next = { branch: "next", commit: gitShortHead(repo) };
  gitCheckout(repo, "master");
  gitCheckout(repo, "feat", { create: true });
  await writeFiles(repo, { "src/a.ts": "a2\n" });
  gitCommitAll(repo, "Фича правит a", "2026-09-10T10:00:00+03:00");
  const feat = { branch: "feat", commit: gitShortHead(repo) };
  await writeFiles(repo, { "src/b.ts": "b2\n" });
  gitCommitAll(repo, "Фича правит b", "2026-09-11T10:00:00+03:00");
  gitCheckout(repo, "master");
  return { repo, feat, next };
}

async function featureEditingOneFileTwiceWhileMainEditsItsEnd(): Promise<{ repo: string; feat: TaskOrigin; next: TaskOrigin }> {
  const repo = await makeGitRepo(await makeTempDir(), "spa");
  await writeFiles(repo, { "src/long.ts": withLines({}), "src/c.ts": "c1\n" });
  gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
  gitCheckout(repo, "next", { create: true });
  await writeFiles(repo, { "src/c.ts": "c2\n" });
  gitCommitAll(repo, "Ещё не слитая правка c", "2026-09-10T09:00:00+03:00");
  const next = { branch: "next", commit: gitShortHead(repo) };
  gitCheckout(repo, "master");
  gitCheckout(repo, "feat", { create: true });
  await writeFiles(repo, { "src/long.ts": withLines({ 1: "первая" }) });
  gitCommitAll(repo, "Фича правит начало файла", "2026-09-10T10:00:00+03:00");
  const feat = { branch: "feat", commit: gitShortHead(repo) };
  await writeFiles(repo, { "src/long.ts": withLines({ 1: "первая", 5: "пятая" }) });
  gitCommitAll(repo, "Фича снова правит начало файла", "2026-09-11T10:00:00+03:00");
  gitCheckout(repo, "master");
  await writeFiles(repo, { "src/long.ts": withLines({ 40: "последняя" }) });
  gitCommitAll(repo, "Основная ветка правит конец того же файла", "2026-09-11T12:00:00+03:00");
  return { repo, feat, next };
}

async function featureEditingFirstOfTwinBlocksWhileMainEditsSecond(lineEnd: string): Promise<{ repo: string; feat: TaskOrigin }> {
  const repo = await makeGitRepo(await makeTempDir(), "spa");
  const block = (sum: string) => ["function twin() {", "  const a = 1;", "  const b = 2;", `  return ${sum};`, "  const c = 3;", "  const d = 4;", "}"];
  const twins = (first: string, second: string) => `${[...block(first), "", "const between = 0;", "", ...block(second)].join(lineEnd)}${lineEnd}`;
  await writeFiles(repo, { ".gitattributes": "* -text\n", "src/twins.ts": twins("a + b", "a + b") });
  gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
  gitCheckout(repo, "feat", { create: true });
  await writeFiles(repo, { "src/twins.ts": twins("a * b", "a + b") });
  gitCommitAll(repo, "Фича правит первый блок", "2026-09-10T10:00:00+03:00");
  const feat = { branch: "feat", commit: gitShortHead(repo) };
  gitCheckout(repo, "master");
  await writeFiles(repo, { "src/twins.ts": twins("a + b", "a * b") });
  gitCommitAll(repo, "Основная ветка так же правит второй блок", "2026-09-11T10:00:00+03:00");
  return { repo, feat };
}

async function featureSquashedAfterMainEdit({ start, feature, main }: { start: string; feature: string; main: string }): Promise<{ repo: string; feat: TaskOrigin }> {
  const repo = await makeGitRepo(await makeTempDir(), "spa");
  await writeFiles(repo, { "src/long.ts": start });
  gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
  gitCheckout(repo, "feat", { create: true });
  await writeFiles(repo, { "src/long.ts": feature });
  gitCommitAll(repo, "Фича правит файл", "2026-09-10T10:00:00+03:00");
  const feat = { branch: "feat", commit: gitShortHead(repo) };
  gitCheckout(repo, "master");
  await writeFiles(repo, { "src/long.ts": main });
  gitCommitAll(repo, "Основная ветка тем временем правит тот же файл", "2026-09-11T12:00:00+03:00");
  gitMergeSquash(repo, "feat");
  gitCommitAll(repo, "Слить feat одним коммитом", "2026-09-12T10:00:00+03:00");
  return { repo, feat };
}

const FUNCTION_A = "function a() {\n  return 1;\n}\n";

const functionB = (returned: string) => `function b() {\n  const x = 1;\n  return ${returned};\n}\n`;

const awaiting = (repo: string, origins: Record<string, TaskOrigin>) => awaitingMerge({ repo, taskIds: Object.keys(origins), origins: new Map(Object.entries(origins)) });

describe("awaitingMerge", () => {
  it("ветка влита squash-слиянием и жива локально — задача с неё не ждёт слияния и после правки её строк в основной ветке", async () => {
    const { repo, feat, next } = await featureOfTwoCommits();
    gitMergeSquash(repo, "feat");
    gitCommitAll(repo, "Слить feat одним коммитом", "2026-09-12T10:00:00+03:00");
    await writeFiles(repo, { "src/a.ts": "a3\n" });
    gitCommitAll(repo, "Правка a после слияния", "2026-09-13T10:00:00+03:00");

    expect(await awaiting(repo, { "SPA-1": feat, "SPA-2": next })).toEqual(new Set(["SPA-2"]));
  });

  it("ветка влита rebase-слиянием и жива локально — задача с неё не ждёт слияния", async () => {
    const { repo, feat, next } = await featureOfTwoCommits();
    await writeFiles(repo, { "src/c.ts": "c0\n" });
    gitCommitAll(repo, "Основная ветка правит c", "2026-09-11T12:00:00+03:00");
    gitRebaseMerge(repo, "feat", "2026-09-12T10:00:00+03:00");

    expect(await awaiting(repo, { "SPA-1": feat, "SPA-2": next })).toEqual(new Set(["SPA-2"]));
  });

  it("ветка правила файл двумя коммитами, основная ветка тем временем правила его конец, ветку влили squash-слиянием — задача не ждёт слияния", async () => {
    const { repo, feat, next } = await featureEditingOneFileTwiceWhileMainEditsItsEnd();
    gitMergeSquash(repo, "feat");
    gitCommitAll(repo, "Слить feat одним коммитом", "2026-09-12T10:00:00+03:00");

    expect(await awaiting(repo, { "SPA-1": feat, "SPA-2": next })).toEqual(new Set(["SPA-2"]));
  });

  it("ветка правила файл двумя коммитами, основная ветка тем временем правила его конец, ветку влили rebase-слиянием — задача не ждёт слияния", async () => {
    const { repo, feat, next } = await featureEditingOneFileTwiceWhileMainEditsItsEnd();
    gitRebaseMerge(repo, "feat", "2026-09-12T10:00:00+03:00");

    expect(await awaiting(repo, { "SPA-1": feat, "SPA-2": next })).toEqual(new Set(["SPA-2"]));
  });

  it.each([
    { change: "добавила строки в начало файла", start: withLines({}), feature: withLines({ 35: "тридцать пятая" }), main: `новая первая\nновая вторая\n${withLines({})}` },
    {
      change: "добавила функцию прямо над той, что правит ветка",
      start: `${FUNCTION_A}\n${functionB("x")}`,
      feature: `${FUNCTION_A}\n${functionB("x + 1")}`,
      main: `${FUNCTION_A}\nfunction c() {\n  return 3;\n}\n\n${functionB("x")}`,
    },
    {
      change: "удалила строку между двумя правками ветки",
      start: withLines({}),
      feature: withLines({ 10: "десятая", 18: "восемнадцатая" }),
      main: `${LINES.filter((line) => line !== "строка 14").join("\n")}\n`,
    },
  ])("основная ветка тем временем $change, ветку влили squash-слиянием — задача не ждёт слияния", async (versions) => {
    const { repo, feat } = await featureSquashedAfterMainEdit(versions);

    expect(await awaiting(repo, { "SPA-1": feat })).toEqual(new Set());
  });

  it.each([
    { endings: "LF", lineEnd: "\n" },
    { endings: "CRLF", lineEnd: "\r\n" },
  ])("основная ветка сделала ту же правку, что и ветка, но во втором из двух одинаковых блоков файла со строками $endings — задача ждёт слияния", async ({ lineEnd }) => {
    const { repo, feat } = await featureEditingFirstOfTwinBlocksWhileMainEditsSecond(lineEnd);

    expect(await awaiting(repo, { "SPA-1": feat })).toEqual(new Set(["SPA-1"]));
  });

  it("основная ветка сделала ту же правку, что и ветка, на том же месте, но с другим отступом — задача ждёт слияния", async () => {
    const loop = (logged: string) => `def total(items):\n    result = 0\n    for item in items:\n        result += item\n${logged}    return result\n`;
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/total.py": loop("") });
    gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
    gitCheckout(repo, "feat", { create: true });
    await writeFiles(repo, { "src/total.py": loop("        log(item)\n") });
    gitCommitAll(repo, "Фича пишет в журнал каждый элемент", "2026-09-10T10:00:00+03:00");
    const feat = { branch: "feat", commit: gitShortHead(repo) };
    gitCheckout(repo, "master");
    await writeFiles(repo, { "src/total.py": loop("    log(item)\n") });
    gitCommitAll(repo, "Основная ветка пишет в журнал последний элемент", "2026-09-11T10:00:00+03:00");

    expect(await awaiting(repo, { "SPA-1": feat })).toEqual(new Set(["SPA-1"]));
  });

  it("коммита создания нет в репозитории — задача не ждёт слияния вечно, хотя её ветка жива и не влита", async () => {
    const { repo, next } = await featureOfTwoCommits();

    expect(await awaiting(repo, { "SPA-1": { branch: "next", commit: "1".repeat(40) }, "SPA-2": next })).toEqual(new Set(["SPA-2"]));
  });
});
