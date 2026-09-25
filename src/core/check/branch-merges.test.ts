import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { countingGit } from "../git/testing/counting-git";
import { makeTask } from "../model/testing/make-task";
import { gitCheckout, gitCommitAll, gitMergeNoFastForward, makeGitRepo, makeTempDir, writeFiles } from "../store/testing/temp-dirs";
import { anchorOf } from "./anchor";
import { mergesKnownAtCreation } from "./branch-merges";
import { collectRepoFacts } from "./repo-facts";

const CREATED = "2026-09-11T10:00:00+03:00";
const LINES = Array.from({ length: 40 }, (_, index) => `export const value${index + 1} = ${index + 1};`);

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
    const facts = await collectRepoFacts(repo, { since: new Date(CREATED), paths: ["src/a.ts"] });
    const counting = countingGit();

    const known = await mergesKnownAtCreation({ repo, tasks, facts, origins: new Map(tasks.map((task) => [task.id, origin])), git: counting.git });

    expect(counting.processes()).toBe(merges.length);
    expect(known.size).toBe(0);
  });
});
