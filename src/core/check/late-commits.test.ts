import { describe, expect, it } from "vitest";
import { gitFailing } from "../git/testing/failing-git";
import { makeTask } from "../model/testing/make-task";
import { gitCheckout, gitCommitAll, gitMergeFastForward, gitRebase, makeGitRepo, makeTempDir, writeFiles } from "../store/testing/temp-dirs";
import { anchorStates } from "./candidates";
import { commitsKnownAtMark } from "./known-commits";
import { commitsArrivedLate } from "./late-commits";
import { collectRepoFacts } from "./repo-facts";
import { NO_MARK_COMMITS, reviewMark } from "./reviewed-task";

async function editFastForwardedAfterMarkWithEarlierDate() {
  const repo = await makeGitRepo(await makeTempDir(), "spa");
  await writeFiles(repo, { "src/a.ts": "a1\n" });
  gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
  gitCheckout(repo, "feat", { create: true, at: "2026-09-09T11:00:00+03:00" });
  await writeFiles(repo, { "src/a.ts": "a2\n" });
  gitCommitAll(repo, "Правка a на ветке", "2026-09-10T10:00:00+03:00");
  gitCheckout(repo, "master", { at: "2026-09-10T11:00:00+03:00" });
  gitMergeFastForward(repo, "feat", "2026-09-12T10:00:00+03:00");
  return questionAbout(repo);
}

async function localCommitRebasedOverEarlierEdit() {
  const repo = await makeGitRepo(await makeTempDir(), "spa");
  await writeFiles(repo, { "src/a.ts": "a1\n", "src/b.ts": "b1\n" });
  gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
  gitCheckout(repo, "upstream", { create: true, at: "2026-09-09T11:00:00+03:00" });
  await writeFiles(repo, { "src/a.ts": "a2\n" });
  gitCommitAll(repo, "Правка a в upstream", "2026-09-09T12:00:00+03:00");
  gitCheckout(repo, "master", { at: "2026-09-09T13:00:00+03:00" });
  await writeFiles(repo, { "src/b.ts": "b2\n" });
  gitCommitAll(repo, "Локальный коммит", "2026-09-10T10:00:00+03:00");
  gitRebase(repo, "upstream", "2026-09-12T10:00:00+03:00");
  return questionAbout(repo);
}

async function questionAbout(repo: string) {
  const tasks = [makeTask({ id: "SPA-1", source: "src/a.ts:1", created: "2026-09-11T10:00:00+03:00" })];
  const facts = await collectRepoFacts(repo, new Map(tasks.map((task) => ["src/a.ts", reviewMark(task)])));
  const anchors = anchorStates(tasks, facts);
  const question = { repo, tasks, facts, anchors, marks: NO_MARK_COMMITS };
  return { ...question, knownCommits: await commitsKnownAtMark(question) };
}

describe("commitsArrivedLate", () => {
  it("правка строки задачи, пришедшая перемоткой после отметки, — поздний коммит задачи", async () => {
    const question = await editFastForwardedAfterMarkWithEarlierDate();

    const { late, unknown } = await commitsArrivedLate(question);

    expect({ late: [...late.keys()], unknown }).toEqual({ late: ["SPA-1"], unknown: new Set() });
  });

  it.each([
    ["merge-base --is-ancestor", (args: string[]) => args[0] === "merge-base"],
    ["log --first-parent", (args: string[]) => args[0] === "log" && args.includes("--first-parent")],
    ["cat-file", (args: string[]) => args[0] === "cat-file"],
  ])("сбой git на %s — поздние коммиты задачи неизвестны, а не «их нет»", async (_command, fails) => {
    const question = await editFastForwardedAfterMarkWithEarlierDate();

    const failed = await commitsArrivedLate({ ...question, git: gitFailing(fails) });

    expect(failed).toEqual({ late: new Map(), unknown: new Set(["SPA-1"]) });
  });

  it("сбой git на вопросе, пришло ли в HEAD содержимое переписанного rebase коммита отметки, — поздние коммиты задачи неизвестны, а не «их нет»", async () => {
    const question = await localCommitRebasedOverEarlierEdit();

    const [late, failed] = await Promise.all([commitsArrivedLate(question), commitsArrivedLate({ ...question, git: gitFailing((args) => args[0] === "diff-tree") })]);

    expect({ late: [...late.late.keys()], failed }).toEqual({ late: ["SPA-1"], failed: { late: new Map(), unknown: new Set(["SPA-1"]) } });
  });
});
