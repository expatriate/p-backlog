import { describe, expect, it } from "vitest";
import { gitFailing } from "../git/testing/failing-git";
import { makeTask } from "../model/testing/make-task";
import { gitCheckout, gitCommitAll, gitMergeFastForward, gitShortHead, makeGitRepo, makeTempDir, writeFiles } from "../store/testing/temp-dirs";
import { anchorOf } from "./anchor";
import { traceSources } from "./current-source";
import { collectRepoFacts } from "./repo-facts";
import { NO_MARK_COMMITS, reviewMark } from "./reviewed-task";
import { markLineOf, taskBases } from "./task-base";

const ancestryUnanswered = gitFailing((args) => args[0] === "merge-base");

const numbered = [1, 2, 3, 4, 5, 6, 7, 8].map((index) => `export const a${index} = ${index};`).join("\n");

async function lineEditedOnBranchBeforeMarkAndFastForwardedAfter(markedOnOtherBranch?: "other-branch") {
  const repo = await makeGitRepo(await makeTempDir(), "spa");
  await writeFiles(repo, { "src/a.ts": numbered });
  gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
  gitCheckout(repo, "feat", { create: true, at: "2026-09-09T11:00:00+03:00" });
  await writeFiles(repo, { "src/a.ts": numbered.replace("a3 = 3", "a3 = 33") });
  gitCommitAll(repo, "Правка строки задачи на ветке", "2026-09-10T10:00:00+03:00");
  gitCheckout(repo, "master", { at: "2026-09-10T11:00:00+03:00" });
  if (markedOnOtherBranch !== undefined) {
    gitCheckout(repo, "unrelated", { create: true, at: "2026-09-10T12:00:00+03:00" });
    await writeFiles(repo, { "src/other.ts": "export const other = true;\n" });
    gitCommitAll(repo, "Независимая ветка", "2026-09-10T13:00:00+03:00");
    gitCheckout(repo, "master", { at: "2026-09-12T09:00:00+03:00" });
  }
  gitMergeFastForward(repo, "feat", "2026-09-12T10:00:00+03:00");
  return repo;
}

describe("traceSources", () => {
  it("сбой git на вопросе «HEAD на момент отметки — предок текущего?» оставляет строку задачи неотслеженной, а не выдаёт её за код другой ветки", async () => {
    const repo = await lineEditedOnBranchBeforeMarkAndFastForwardedAfter();
    const task = makeTask({ id: "SPA-1", source: "src/a.ts:3", anchor: anchorOf(numbered, "src/a.ts:3") ?? undefined, created: "2026-09-11T10:00:00+03:00" });
    const facts = await collectRepoFacts(repo, new Map([["src/a.ts", reviewMark(task)]]));

    const traces = await traceSources([task], { facts, late: new Map() }, taskBases(repo, NO_MARK_COMMITS, ancestryUnanswered));

    expect(traces.get("SPA-1")).toEqual({ kind: "untraced" });
  });
});

describe("taskBases", () => {
  it("сбой git на вопросе «checkout на момент отметки — предок HEAD?» не подменяет дифф от checkout диффом от даты, где правки строки задачи не видно", async () => {
    const repo = await lineEditedOnBranchBeforeMarkAndFastForwardedAfter();
    const task = makeTask({ id: "SPA-1", source: "src/a.ts:3", created: "2026-09-11T10:00:00+03:00" });

    const diff = await taskBases(repo, NO_MARK_COMMITS, ancestryUnanswered).diffSinceBase(task, "src/a.ts");

    expect(diff).toBeNull();
  });

  it("нет коммита создания — reflog сохраняет в диффе правку, пришедшую перемоткой", async () => {
    const repo = await lineEditedOnBranchBeforeMarkAndFastForwardedAfter();
    const task = makeTask({ id: "SPA-1", source: "src/a.ts:3", created: "2026-09-11T10:00:00+03:00" });
    const missingOrigin = { ...NO_MARK_COMMITS, origins: new Map([["SPA-1", { commit: "1".repeat(40) }]]) };

    const diff = await taskBases(repo, missingOrigin).diffSinceBase(task, "src/a.ts");

    expect(diff).toMatchObject({ changed: [{ from: 3, to: 3 }] });
  });

  it("нет origin — запись reflog с чужой ветки не меняет линию задачи", async () => {
    const repo = await lineEditedOnBranchBeforeMarkAndFastForwardedAfter("other-branch");
    const task = makeTask({ id: "SPA-1", source: "src/a.ts:3", created: "2026-09-11T10:00:00+03:00" });
    const missingOrigin = { ...NO_MARK_COMMITS, origins: new Map([[task.id, { commit: "1".repeat(40) }]]) };

    expect(await taskBases(repo, missingOrigin).baseOf(task)).toMatchObject({ kind: "approximate", markLine: "this-line" });
  });

  it("у подтверждённой задачи дифф считается от коммита подтверждения, а не от того, что reflog этого checkout помнит на момент отметки", async () => {
    const repo = await lineEditedOnBranchBeforeMarkAndFastForwardedAfter();
    const verifiedOnBranch = verifiedTask(gitShortHead(repo));

    const diff = await taskBases(repo, verifiedOnBranch.marks).diffSinceBase(verifiedOnBranch.task, "src/a.ts");

    expect(diff).toMatchObject({ excerpt: undefined, changed: [] });
  });

  it("задачу подтвердили в другом worktree на master, пока этот checkout стоял на невлитой полосе, — линия отметки своя", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": numbered });
    gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
    const verifiedOnMaster = verifiedTask(gitShortHead(repo));
    gitCheckout(repo, "lane", { create: true, at: "2026-09-09T11:00:00+03:00" });
    await writeFiles(repo, { "src/a.ts": numbered.replace("a3 = 3", "a3 = 33") });
    gitCommitAll(repo, "Правка на полосе", "2026-09-09T12:00:00+03:00");
    gitCheckout(repo, "master", { at: "2026-09-12T10:00:00+03:00" });

    const line = markLineOf(await taskBases(repo, verifiedOnMaster.marks).baseOf(verifiedOnMaster.task));

    expect(line).toBe("this-line");
  });
});

function verifiedTask(commit: string) {
  const verified = "2026-09-11T10:00:00+03:00";
  return {
    task: makeTask({ id: "SPA-1", source: "src/a.ts", created: "2026-09-08T10:00:00+03:00", verified }),
    marks: { ...NO_MARK_COMMITS, verifications: new Map([["SPA-1", { at: verified, commit }]]) },
  };
}
