import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { countingGit } from "../git/testing/counting-git";
import type { TaskOrigin } from "../journal/events";
import { makeTask } from "../model/testing/make-task";
import { gitCheckout, gitCommitAll, gitMergeNoFastForward, gitMergeSquash, gitRebase, makeGitRepo, makeTempDir, writeFiles } from "../store/testing/temp-dirs";
import { anchorOf } from "./anchor";
import { mergesKnownAtCreation } from "./known-merges";
import { anchorStates, codeReview } from "./candidates";
import { collectRepoFacts } from "./repo-facts";

const CREATED = "2026-09-11T10:00:00+03:00";
const LINES = Array.from({ length: 40 }, (_, index) => `export const value${index + 1} = ${index + 1};`);

const shortHead = (repo: string) => execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();

const fileOf = (lines: readonly string[]) => `${lines.join("\n")}\n`;

async function changedCommitSubjects(repo: string, origin: TaskOrigin): Promise<string[]> {
  const tasks = [makeTask({ id: "SPA-1", created: CREATED, source: "src/a.ts" })];
  const facts = await collectRepoFacts(repo, new Map([["src/a.ts", Date.parse(CREATED)]]));
  const anchors = anchorStates(tasks, facts);
  const known = await mergesKnownAtCreation({ repo, tasks, facts, anchors, origins: new Map([["SPA-1", origin]]) });
  return codeReview(tasks, facts, known, anchors).candidates.flatMap((candidate) => (candidate.kind === "source-changed" ? candidate.commits.map((commit) => commit.subject) : []));
}

describe("слияния, уже известные задаче при создании", () => {
  it("git спрашивается только о задачах без якоря и один раз на слияние, коммит создания и путь", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    const text = `${LINES.join("\n")}\n`;
    await writeFiles(repo, { "src/a.ts": text });
    gitCommitAll(repo, "Начало", "2026-09-10T10:00:00+03:00");
    const origin = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
    const merges = [12, 13, 14];
    let lines = [...LINES];
    for (const day of merges) {
      gitCheckout(repo, `f${day}`, { create: true });
      lines = lines.map((line, index) => (index === day + 10 ? `export const value${index + 1} = ${day * 100};` : line));
      await writeFile(join(repo, "src/a.ts"), `${lines.join("\n")}\n`);
      gitCommitAll(repo, `Ветка ${day}`, `2026-09-${day}T10:00:00+03:00`);
      gitCheckout(repo, "master");
      gitMergeNoFastForward(repo, `f${day}`, `2026-09-${day}T12:00:00+03:00`);
    }
    const anchored = (id: string, line: number) => makeTask({ id, created: CREATED, source: `src/a.ts:${line}`, anchor: anchorOf(text, `src/a.ts:${line}`) ?? undefined });
    const tasks = [anchored("SPA-1", 2), anchored("SPA-2", 5), makeTask({ id: "SPA-3", created: CREATED, source: "src/a.ts" }), makeTask({ id: "SPA-4", created: CREATED, source: "src/a.ts" })];
    const facts = await collectRepoFacts(repo, new Map([["src/a.ts", Date.parse(CREATED)]]));
    const counting = countingGit();

    const known = await mergesKnownAtCreation({ repo, tasks, facts, anchors: anchorStates(tasks, facts), origins: new Map(tasks.map((task) => [task.id, { commit: origin }])), git: counting.git });

    expect(counting.processes()).toBe(merges.length);
    expect(known.size).toBe(0);
  });

  it("правка ветки, отменённая ещё до создания задачи, а после слияния ветки повторённая в основной ветке, делает задачу кандидатом", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": fileOf(LINES) });
    gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
    gitCheckout(repo, "feat", { create: true });
    const withFoo = [...LINES.slice(0, 3), "export const foo = 0;", ...LINES.slice(3)];
    await writeFiles(repo, { "src/a.ts": fileOf(withFoo) });
    gitCommitAll(repo, "Фича добавляет foo", "2026-09-10T10:00:00+03:00");
    const edited = LINES.map((line, index) => (index === 20 ? "export const value21 = 2100;" : line));
    await writeFiles(repo, { "src/a.ts": fileOf(edited) });
    gitCommitAll(repo, "Фича убирает foo и правит value21", "2026-09-10T12:00:00+03:00");
    const origin = { branch: "feat", commit: shortHead(repo) };
    gitCheckout(repo, "master");
    gitMergeSquash(repo, "feat");
    gitCommitAll(repo, "Слить feat одним коммитом", "2026-09-12T10:00:00+03:00");
    await writeFiles(repo, { "src/a.ts": fileOf([...edited.slice(0, 3), "export const foo = 0;", ...edited.slice(3)]) });
    gitCommitAll(repo, "Вернуть foo в основной ветке", "2026-09-13T10:00:00+03:00");

    expect(await changedCommitSubjects(repo, origin)).toEqual(["Вернуть foo в основной ветке"]);
  });

  it("ветку задачи перебазировали на основную и влили merge-коммитом — ни копия её коммита, ни merge-коммит не делают задачу кандидатом", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "a1\n", "src/b.ts": "b1\n" });
    gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
    gitCheckout(repo, "feat", { create: true });
    await writeFiles(repo, { "src/a.ts": "a2\n" });
    gitCommitAll(repo, "Фича правит a", "2026-09-10T10:00:00+03:00");
    const origin = { branch: "feat", commit: shortHead(repo) };
    gitCheckout(repo, "master");
    await writeFiles(repo, { "src/b.ts": "b2\n" });
    gitCommitAll(repo, "Основная ветка правит b", "2026-09-10T12:00:00+03:00");
    gitCheckout(repo, "feat");
    gitRebase(repo, "master", "2026-09-12T09:00:00+03:00");
    gitCheckout(repo, "master");
    gitMergeNoFastForward(repo, "feat", "2026-09-12T10:00:00+03:00");

    expect(await changedCommitSubjects(repo, origin)).toEqual([]);
  });
});
