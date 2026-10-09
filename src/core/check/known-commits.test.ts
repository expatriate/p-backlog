import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { literalPathspecs } from "../git/run";
import { countingGit } from "../git/testing/counting-git";
import type { TaskOrigin } from "../journal/events";
import { makeTask } from "../model/testing/make-task";
import { gitCheckout, gitCommitAll, gitMergeNoFastForward, gitMergeSquash, gitRebase, gitRebaseMerge, gitShortHead, makeGitRepo, makeTempDir, writeFiles } from "../store/testing/temp-dirs";
import { anchorOf } from "./anchor";
import { commitsKnownAtCreation } from "./known-commits";
import { anchorStates, codeReview } from "./candidates";
import { commitsCarryingContent } from "./landed-content";
import { collectRepoFacts } from "./repo-facts";

const CREATED = "2026-09-11T10:00:00+03:00";
const LINES = Array.from({ length: 40 }, (_, index) => `export const value${index + 1} = ${index + 1};`);

const fileOf = (lines: readonly string[]) => `${lines.join("\n")}\n`;

const withValues = (lines: readonly string[], values: Record<number, number>) => lines.map((line, index) => (values[index + 1] === undefined ? line : `export const value${index + 1} = ${values[index + 1]};`));

async function changedCommitSubjects(repo: string, origin: TaskOrigin): Promise<string[]> {
  const tasks = [makeTask({ id: "SPA-1", created: CREATED, source: "src/a.ts" })];
  const facts = await collectRepoFacts(repo, new Map([["src/a.ts", Date.parse(CREATED)]]));
  const anchors = anchorStates(tasks, facts);
  const known = await commitsKnownAtCreation({ repo, tasks, facts, anchors, origins: new Map([["SPA-1", origin]]) });
  return codeReview(tasks, facts, known, anchors).candidates.flatMap((candidate) => (candidate.kind === "source-changed" ? candidate.commits.map((commit) => commit.subject) : []));
}

async function featureEditingA(): Promise<{ repo: string; origin: TaskOrigin }> {
  const repo = await makeGitRepo(await makeTempDir(), "spa");
  await writeFiles(repo, { "src/a.ts": "a1\n", "src/b.ts": "b1\n" });
  gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
  gitCheckout(repo, "feat", { create: true });
  await writeFiles(repo, { "src/a.ts": "a2\n" });
  gitCommitAll(repo, "Фича правит a", "2026-09-10T10:00:00+03:00");
  const origin = { branch: "feat", commit: gitShortHead(repo) };
  gitCheckout(repo, "master");
  return { repo, origin };
}

describe("коммиты, уже известные задаче при создании", () => {
  it("git спрашивается только о задачах без якоря: один раз на слияние, коммит создания и путь и один раз о копиях коммита создания по пути", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    const text = fileOf(LINES);
    await writeFiles(repo, { "src/a.ts": text });
    gitCommitAll(repo, "Начало", "2026-09-10T10:00:00+03:00");
    gitCheckout(repo, "feat", { create: true });
    await writeFile(join(repo, "src/a.ts"), fileOf(withValues(LINES, { 36: 3600 })));
    gitCommitAll(repo, "Фича правит value36", "2026-09-10T12:00:00+03:00");
    const origin = { branch: "feat", commit: gitShortHead(repo) };
    gitCheckout(repo, "master");
    const merges = [12, 13, 14];
    let lines = [...LINES];
    for (const day of merges) {
      gitCheckout(repo, `f${day}`, { create: true });
      lines = withValues(lines, { [day + 11]: day * 100 });
      await writeFile(join(repo, "src/a.ts"), fileOf(lines));
      gitCommitAll(repo, `Ветка ${day}`, `2026-09-${day}T10:00:00+03:00`);
      gitCheckout(repo, "master");
      gitMergeNoFastForward(repo, `f${day}`, `2026-09-${day}T12:00:00+03:00`);
    }
    const anchored = (id: string, line: number) => makeTask({ id, created: CREATED, source: `src/a.ts:${line}`, anchor: anchorOf(text, `src/a.ts:${line}`) ?? undefined });
    const tasks = [anchored("SPA-1", 2), anchored("SPA-2", 5), makeTask({ id: "SPA-3", created: CREATED, source: "src/a.ts" }), makeTask({ id: "SPA-4", created: CREATED, source: "src/a.ts" })];
    const facts = await collectRepoFacts(repo, new Map([["src/a.ts", Date.parse(CREATED)]]));
    const copiesQuestion = countingGit();
    await commitsCarryingContent(repo, origin.commit, literalPathspecs(["src/a.ts"]), copiesQuestion.git);
    const counting = countingGit();

    const known = await commitsKnownAtCreation({ repo, tasks, facts, anchors: anchorStates(tasks, facts), origins: new Map(tasks.map((task) => [task.id, origin])), git: counting.git });

    expect(counting.processes()).toBe(merges.length + copiesQuestion.processes());
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
    const origin = { branch: "feat", commit: gitShortHead(repo) };
    gitCheckout(repo, "master");
    gitMergeSquash(repo, "feat");
    gitCommitAll(repo, "Слить feat одним коммитом", "2026-09-12T10:00:00+03:00");
    await writeFiles(repo, { "src/a.ts": fileOf([...edited.slice(0, 3), "export const foo = 0;", ...edited.slice(3)]) });
    gitCommitAll(repo, "Вернуть foo в основной ветке", "2026-09-13T10:00:00+03:00");

    expect(await changedCommitSubjects(repo, origin)).toEqual(["Вернуть foo в основной ветке"]);
  });

  it("основная ветка сделала ту же правку, что и ветка задачи, но во втором из двух одинаковых блоков файла — после squash-слияния ветки кандидатом задачу делает эта правка, а не squash-коммит", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    const block = (sum: string) => ["function twin() {", "  const a = 1;", "  const b = 2;", `  return ${sum};`, "  const c = 3;", "  const d = 4;", "}"];
    const twins = (first: string, second: string) => fileOf([...block(first), "", "const between = 0;", "", ...block(second)]);
    await writeFiles(repo, { "src/a.ts": twins("a + b", "a + b") });
    gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
    gitCheckout(repo, "feat", { create: true });
    await writeFiles(repo, { "src/a.ts": twins("a * b", "a + b") });
    gitCommitAll(repo, "Фича правит первый блок", "2026-09-10T10:00:00+03:00");
    const origin = { branch: "feat", commit: gitShortHead(repo) };
    gitCheckout(repo, "master");
    await writeFiles(repo, { "src/a.ts": twins("a + b", "a * b") });
    gitCommitAll(repo, "Основная ветка так же правит второй блок", "2026-09-12T10:00:00+03:00");
    gitMergeSquash(repo, "feat");
    gitCommitAll(repo, "Слить feat одним коммитом", "2026-09-13T10:00:00+03:00");

    expect(await changedCommitSubjects(repo, origin)).toEqual(["Основная ветка так же правит второй блок"]);
  });

  it("ветку задачи перебазировали на основную и влили merge-коммитом — ни копия её коммита, ни merge-коммит не делают задачу кандидатом", async () => {
    const { repo, origin } = await featureEditingA();
    await writeFiles(repo, { "src/b.ts": "b2\n" });
    gitCommitAll(repo, "Основная ветка правит b", "2026-09-10T12:00:00+03:00");
    gitCheckout(repo, "feat");
    gitRebase(repo, "master", "2026-09-12T09:00:00+03:00");
    gitCheckout(repo, "master");
    gitMergeNoFastForward(repo, "feat", "2026-09-12T10:00:00+03:00");

    expect(await changedCommitSubjects(repo, origin)).toEqual([]);
  });

  it("задача заведена на detached HEAD, в origin нет ветки — squash-коммит, несущий её коммит создания, не делает её кандидатом", async () => {
    const { repo, origin } = await featureEditingA();
    await writeFiles(repo, { "src/b.ts": "b2\n" });
    gitCommitAll(repo, "Основная ветка правит b", "2026-09-10T12:00:00+03:00");
    gitMergeSquash(repo, "feat");
    gitCommitAll(repo, "Слить feat одним коммитом", "2026-09-12T10:00:00+03:00");

    expect(await changedCommitSubjects(repo, { commit: origin.commit })).toEqual([]);
  });

  it("коммит ветки задачи взяли cherry-pick в релизную ветку, основную ветку слили со своей веткой и с релизной — копия из релизной ветки не делает задачу кандидатом, хотя слияние с основной её отбросило из упрощённой истории файла", async () => {
    const { repo, origin } = await featureEditingA();
    gitCheckout(repo, "release", { create: true });
    gitRebaseMerge(repo, "feat", "2026-09-12T10:00:00+03:00");
    gitCheckout(repo, "master");
    gitMergeSquash(repo, "feat");
    gitCommitAll(repo, "Слить feat одним коммитом", "2026-09-13T10:00:00+03:00");
    gitMergeNoFastForward(repo, "release", "2026-09-14T10:00:00+03:00");

    expect(await changedCommitSubjects(repo, origin)).toEqual([]);
  });

  it("коммиты ветки задачи сначала взяли cherry-pick в релизную ветку, потом основная ветка сама повторила первую правку и слилась с релизной — кандидатом задачу делает повтор, а не слияние", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": fileOf(LINES) });
    gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
    gitCheckout(repo, "feat", { create: true });
    await writeFiles(repo, { "src/a.ts": fileOf(withValues(LINES, { 10: 1000 })) });
    gitCommitAll(repo, "Фича правит value10", "2026-09-10T10:00:00+03:00");
    await writeFiles(repo, { "src/a.ts": fileOf(withValues(LINES, { 10: 1000, 30: 3000 })) });
    gitCommitAll(repo, "Фича правит value30", "2026-09-10T11:00:00+03:00");
    const origin = { branch: "feat", commit: gitShortHead(repo) };
    gitCheckout(repo, "master");
    gitCheckout(repo, "release", { create: true });
    gitRebaseMerge(repo, "feat", "2026-09-12T10:00:00+03:00");
    gitCheckout(repo, "master");
    await writeFiles(repo, { "src/a.ts": fileOf(withValues(LINES, { 38: 3800 })) });
    gitCommitAll(repo, "Основная ветка правит value38", "2026-09-10T12:00:00+03:00");
    await writeFiles(repo, { "src/a.ts": fileOf(withValues(LINES, { 10: 1000, 38: 3800 })) });
    gitCommitAll(repo, "Основная ветка повторяет правку value10", "2026-09-13T10:00:00+03:00");
    gitMergeNoFastForward(repo, "release", "2026-09-14T10:00:00+03:00");

    expect(await changedCommitSubjects(repo, origin)).toEqual(["Основная ветка повторяет правку value10"]);
  });
});
