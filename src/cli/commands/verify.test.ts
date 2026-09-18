import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatLocalIso } from "../../core/model/dates";
import { loadBacklog } from "../../core/store/load";
import { readJournal } from "../../core/store/journal";
import { gitCommitAll, writeFiles } from "../../core/store/testing/temp-dirs";
import { EXIT } from "../io";
import { makeCliSandbox } from "../testing/cli-harness";

describe("backlog verify", () => {
  it("подтверждённая задача перестаёт быть кандидатом, --source переносит место", async () => {
    const { run, repo, root } = await makeCliSandbox();
    await writeFiles(repo, { "src/a.ts": "1\n" });
    gitCommitAll(repo, "Начало", "2026-09-16T10:00:00Z");
    await run(["new", "--title", "Таймаут", "--source", "src/a.ts:1"]);
    await writeFile(join(repo, "src/a.ts"), "2\n");
    gitCommitAll(repo, "Поправить соседнее", "2026-09-17T15:00:00Z");
    expect((await run(["check"])).code).toBe(EXIT.needsReview);

    const verifiedAt = new Date("2026-09-17T16:00:00Z");
    const result = await run(["verify", "SPA-1", "--source", "src/a.ts:2"], { now: verifiedAt });

    expect(result).toMatchObject({ code: EXIT.ok, out: "SPA-1: подтверждена, source → src/a.ts:2" });
    const task = (await loadBacklog(root)).tasks.find((candidate) => candidate.id === "SPA-1");
    expect(task).toMatchObject({ source: "src/a.ts:2", verified: formatLocalIso(verifiedAt) });
    expect((await run(["check"])).out).toBe("Беклог в порядке");
  });

  it("отказывает закрытой и неизвестной задаче, пустому --source", async () => {
    const { run } = await makeCliSandbox();
    await run(["new", "--title", "X"]);
    await run(["status", "SPA-1", "cancelled"]);

    expect((await run(["verify", "SPA-1"])).code).toBe(EXIT.refused);
    expect((await run(["verify", "SPA-40"])).code).toBe(EXIT.notFound);
    expect((await run(["verify", "SPA-1", "--source", " "])).code).toBe(EXIT.invalid);
  });

  it("подтверждение пишет в журнал verified, с --source — с новым местом", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--title", "X", "--source", "src/a.ts:1"]);

    await run(["verify", "SPA-1"], { now: new Date("2026-09-17T15:00:00Z") });
    await run(["verify", "SPA-1", "--source", "src/b.ts:2"], { now: new Date("2026-09-17T16:00:00Z") });

    const verified = (await readJournal(join(root, "spa"), "spa")).events.filter((event) => event.kind === "verified");
    expect(verified).toMatchObject([{ via: "cli" }, { via: "cli", source: "src/b.ts:2" }]);
    expect(verified[0]).not.toHaveProperty("source");
  });
});
