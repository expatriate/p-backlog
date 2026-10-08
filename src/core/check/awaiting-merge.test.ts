import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import type { TaskOrigin } from "../journal/events";
import { gitCheckout, gitCommitAll, gitMergeSquash, gitRebaseMerge, makeGitRepo, makeTempDir, writeFiles } from "../store/testing/temp-dirs";
import { awaitingMerge } from "./awaiting-merge";

const shortHead = (repo: string) => execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();

async function featureOfTwoCommits(): Promise<{ repo: string; feat: TaskOrigin; next: TaskOrigin }> {
  const repo = await makeGitRepo(await makeTempDir(), "spa");
  await writeFiles(repo, { "src/a.ts": "a1\n", "src/b.ts": "b1\n", "src/c.ts": "c1\n" });
  gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
  gitCheckout(repo, "next", { create: true });
  await writeFiles(repo, { "src/c.ts": "c2\n" });
  gitCommitAll(repo, "Ещё не слитая правка c", "2026-09-10T09:00:00+03:00");
  const next = { branch: "next", commit: shortHead(repo) };
  gitCheckout(repo, "master");
  gitCheckout(repo, "feat", { create: true });
  await writeFiles(repo, { "src/a.ts": "a2\n" });
  gitCommitAll(repo, "Фича правит a", "2026-09-10T10:00:00+03:00");
  const feat = { branch: "feat", commit: shortHead(repo) };
  await writeFiles(repo, { "src/b.ts": "b2\n" });
  gitCommitAll(repo, "Фича правит b", "2026-09-11T10:00:00+03:00");
  gitCheckout(repo, "master");
  return { repo, feat, next };
}

async function featureEditingOneFileTwiceWhileMainEditsItsEnd(): Promise<{ repo: string; feat: TaskOrigin; next: TaskOrigin }> {
  const repo = await makeGitRepo(await makeTempDir(), "spa");
  const lines = Array.from({ length: 40 }, (_, index) => `строка ${index + 1}`);
  const withLines = (replaced: Record<number, string>) => `${lines.map((line, index) => replaced[index + 1] ?? line).join("\n")}\n`;
  await writeFiles(repo, { "src/long.ts": withLines({}), "src/c.ts": "c1\n" });
  gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
  gitCheckout(repo, "next", { create: true });
  await writeFiles(repo, { "src/c.ts": "c2\n" });
  gitCommitAll(repo, "Ещё не слитая правка c", "2026-09-10T09:00:00+03:00");
  const next = { branch: "next", commit: shortHead(repo) };
  gitCheckout(repo, "master");
  gitCheckout(repo, "feat", { create: true });
  await writeFiles(repo, { "src/long.ts": withLines({ 1: "первая" }) });
  gitCommitAll(repo, "Фича правит начало файла", "2026-09-10T10:00:00+03:00");
  const feat = { branch: "feat", commit: shortHead(repo) };
  await writeFiles(repo, { "src/long.ts": withLines({ 1: "первая", 5: "пятая" }) });
  gitCommitAll(repo, "Фича снова правит начало файла", "2026-09-11T10:00:00+03:00");
  gitCheckout(repo, "master");
  await writeFiles(repo, { "src/long.ts": withLines({ 40: "последняя" }) });
  gitCommitAll(repo, "Основная ветка правит конец того же файла", "2026-09-11T12:00:00+03:00");
  return { repo, feat, next };
}

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

  it("коммита создания нет в репозитории — задача не ждёт слияния вечно, хотя её ветка жива и не влита", async () => {
    const { repo, next } = await featureOfTwoCommits();

    expect(await awaiting(repo, { "SPA-1": { branch: "next", commit: "1".repeat(40) }, "SPA-2": next })).toEqual(new Set(["SPA-2"]));
  });
});
