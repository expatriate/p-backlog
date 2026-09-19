import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CheckReport } from "../../core/check/check-backlog";
import { gitCommitAll, writeFiles } from "../../core/store/testing/temp-dirs";
import { EXIT } from "../io";
import { makeCliSandbox } from "../testing/cli-harness";

async function sandboxWithChangedSource() {
  const sandbox = await makeCliSandbox();
  await writeFiles(sandbox.repo, { "src/a.ts": "1\n" });
  gitCommitAll(sandbox.repo, "Начало", "2026-09-16T10:00:00Z");
  await sandbox.run(["new", "--category", "bug", "--title", "Таймаут", "--source", "src/a.ts:1"]);
  await writeFile(join(sandbox.repo, "src/a.ts"), "2\n");
  gitCommitAll(sandbox.repo, "Поправить таймаут", "2026-09-18T10:00:00Z");
  return sandbox;
}

describe("backlog check", () => {
  it("перечисляет кандидатов с уликами и завершается кодом 1", async () => {
    const { run } = await sandboxWithChangedSource();

    const result = await run(["check"]);

    expect(result.code).toBe(EXIT.needsReview);
    expect(result.out).toMatch(/^Кандидаты на закрытие:\n {2}SPA-1 — Таймаут: код менялся \(src\/a\.ts\): [0-9a-f]{7,} Поправить таймаут$/);
    expect((await run(["check", "--changed"])).code).toBe(EXIT.needsReview);
  });

  it("--json отдаёт отчёт целиком", async () => {
    const { run } = await sandboxWithChangedSource();

    const report = JSON.parse((await run(["check", "--json"])).out) as CheckReport;

    expect(report).toMatchObject({ fixed: [], problems: [], candidates: [{ kind: "source-changed", task: { id: "SPA-1" }, path: "src/a.ts" }] });
  });

  it("чинит висячие ссылки и пишет, что исправил; без находок — код 0", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Первая"]);
    await writeFiles(root, { "spa/SPA-2.md": "---\nid: SPA-2\ntitle: Вторая\ncreated: 2026-09-17T10:00:00Z\nblockedBy: [SPA-40]\n---\n" });

    const fixed = await run(["check"]);
    expect(fixed.code).toBe(EXIT.ok);
    expect(fixed.out).toBe("Исправлено:\n  SPA-2: убраны ссылки на несуществующие задачи: SPA-40");

    expect((await run(["check"])).out).toBe("Беклог в порядке");
  });

  it("выбирает проект как list: текущий, --project или --all-projects", async () => {
    const { run, home } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "X"]);

    expect((await run(["check"], { cwd: home })).code).toBe(EXIT.notFound);
    expect((await run(["check", "--project", "spa"], { cwd: home })).out).toBe("Беклог в порядке");
    expect((await run(["check", "--all-projects"], { cwd: home })).code).toBe(EXIT.ok);
    expect((await run(["check", "--project", "spa", "--all-projects"])).code).toBe(EXIT.invalid);
  });
});
