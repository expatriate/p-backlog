import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { makeGitRepo, makeTempDir } from "../src/core/store/testing/temp-dirs";

const buildDir = join(import.meta.dirname, "../dist/test");
const cli = join(buildDir, "cli.js");

beforeAll(() => {
  execFileSync("node", ["scripts/build-node.mjs", cli], { cwd: join(import.meta.dirname, "..") });
}, 60_000);

describe("собранный бинарник backlog", () => {
  it("создаёт задачу из stdin, показывает её и меняет статус", async () => {
    const home = await makeTempDir();
    const repo = await makeGitRepo(home, "demo-app");
    const env = { ...process.env, BACKLOG_DIR: join(home, "store") };
    const run = (args: string[], input?: string) => spawnSync(cli, args, { cwd: repo, env, input, encoding: "utf8" });

    const created = run(["new", "--title", "Проверка бинарника"], "- [ ] шаг\n");
    expect(created.status).toBe(0);
    expect(created.stdout).toMatch(/^DA-1 .*DA-1\.md\n$/);

    const taken = run(["take", "DA-1"]);
    expect(taken.status).toBe(0);
    expect(taken.stdout).toContain("Статус: in-progress");

    expect(run(["take", "DA-404"]).status).toBe(2);
    expect(run(["status", "DA-1", "done"]).stderr).toContain("не отмечено пунктов чеклиста — 1");
  });
});
