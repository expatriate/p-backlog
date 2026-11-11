import { describe, expect, it } from "vitest";
import { makeTask } from "../model/testing/make-task";
import { gitCheckout, gitCommitAll, gitMergeFastForward, makeGitRepo, makeTempDir, writeFiles } from "../store/testing/temp-dirs";
import { anchorOf } from "./anchor";
import { repoDiffs, traceSources } from "./current-source";
import { collectRepoFacts, type HeadLineOf } from "./repo-facts";
import { reviewMark } from "./reviewed-task";

const lineUnknown: HeadLineOf = async () => "unknown";

const numbered = [1, 2, 3, 4, 5, 6, 7, 8].map((index) => `export const a${index} = ${index};`).join("\n");

async function lineEditedOnBranchBeforeMarkAndFastForwardedAfter() {
  const repo = await makeGitRepo(await makeTempDir(), "spa");
  await writeFiles(repo, { "src/a.ts": numbered });
  gitCommitAll(repo, "Начало", "2026-09-09T10:00:00+03:00");
  gitCheckout(repo, "feat", { create: true, at: "2026-09-09T11:00:00+03:00" });
  await writeFiles(repo, { "src/a.ts": numbered.replace("a3 = 3", "a3 = 33") });
  gitCommitAll(repo, "Правка строки задачи на ветке", "2026-09-10T10:00:00+03:00");
  gitCheckout(repo, "master", { at: "2026-09-10T11:00:00+03:00" });
  gitMergeFastForward(repo, "feat", "2026-09-12T10:00:00+03:00");
  return repo;
}

describe("traceSources", () => {
  it("сбой git на вопросе «HEAD на момент отметки — предок текущего?» оставляет строку задачи неотслеженной, а не выдаёт её за код другой ветки", async () => {
    const repo = await lineEditedOnBranchBeforeMarkAndFastForwardedAfter();
    const task = makeTask({ id: "SPA-1", source: "src/a.ts:3", anchor: anchorOf(numbered, "src/a.ts:3") ?? undefined, created: "2026-09-11T10:00:00+03:00" });
    const facts = await collectRepoFacts(repo, new Map([["src/a.ts", reviewMark(task)]]));

    const traces = await traceSources([task], { facts, late: new Map() }, repoDiffs(repo, new Map(), lineUnknown));

    expect(traces.get("SPA-1")).toEqual({ kind: "untraced" });
  });
});

describe("repoDiffs", () => {
  it("сбой git на вопросе «checkout на момент отметки — предок HEAD?» не подменяет дифф от checkout диффом от даты, где правки строки задачи не видно", async () => {
    const repo = await lineEditedOnBranchBeforeMarkAndFastForwardedAfter();
    const task = makeTask({ id: "SPA-1", source: "src/a.ts:3", created: "2026-09-11T10:00:00+03:00" });

    const diff = await repoDiffs(repo, new Map(), lineUnknown).sinceTaskMark(task, "src/a.ts");

    expect(diff).toBeNull();
  });

  it("коммита создания задачи нет в клоне — дифф берётся от даты отметки, а не пропадает", async () => {
    const repo = await lineEditedOnBranchBeforeMarkAndFastForwardedAfter();
    const task = makeTask({ id: "SPA-1", source: "src/a.ts:3", created: "2026-09-11T10:00:00+03:00" });
    const diffs = repoDiffs(repo, new Map([["SPA-1", { commit: "1".repeat(40) }]]));

    const [fromCreation, sinceMark] = await Promise.all([diffs.sinceTaskMark(task, "src/a.ts"), diffs.since("src/a.ts", new Date(reviewMark(task)))]);

    expect({ fromCreation, sinceMark }).toEqual({ fromCreation: sinceMark, sinceMark: expect.objectContaining({ changed: expect.any(Array) }) });
  });
});
