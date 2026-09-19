import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { gitCommitAll, makeGitRepo, makeTempDir, writeFiles } from "../core/store/testing/temp-dirs";
import { readOrigin } from "./origin";

describe("происхождение задачи", () => {
  it("на ветке — ветка и коммит, при отсоединённом HEAD — только коммит, вне git — ничего", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "a.ts": "a\n" });
    gitCommitAll(repo, "Начало", "2026-09-16T10:00:00Z");
    const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
    const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();

    expect(await readOrigin(repo)).toEqual({ branch, commit });

    execFileSync("git", ["checkout", "-q", "--detach"], { cwd: repo });
    expect(await readOrigin(repo)).toEqual({ commit });

    expect(await readOrigin(await makeTempDir())).toBeUndefined();
  });
});
