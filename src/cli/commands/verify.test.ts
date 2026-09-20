import { rm, writeFile } from "node:fs/promises";
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
    await run(["new", "--category", "bug", "--title", "Таймаут", "--source", "src/a.ts:1"]);
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
    await run(["new", "--category", "bug", "--title", "X"]);
    await run(["status", "SPA-1", "cancelled"]);

    expect((await run(["verify", "SPA-1"])).code).toBe(EXIT.refused);
    expect((await run(["verify", "SPA-40"])).code).toBe(EXIT.notFound);
    expect((await run(["verify", "SPA-1", "--source", " "])).code).toBe(EXIT.invalid);
  });

  it("подтверждение пишет в журнал verified, с --source — с новым местом", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "X", "--source", "src/a.ts:1"]);

    await run(["verify", "SPA-1"], { now: new Date("2026-09-17T15:00:00Z") });
    await run(["verify", "SPA-1", "--source", "src/b.ts:2"], { now: new Date("2026-09-17T16:00:00Z") });

    const verified = (await readJournal(join(root, "spa"), "spa")).events.filter((event) => event.kind === "verified");
    expect(verified).toMatchObject([{ via: "cli" }, { via: "cli", source: "src/b.ts:2" }]);
    expect(verified[0]).not.toHaveProperty("source");
  });

  it("new и verify пишут якорь фрагмента; правка вне фрагмента не делает задачу кандидатом", async () => {
    const { run, repo, root } = await makeCliSandbox();
    const lines = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`);
    await writeFiles(repo, { "src/a.ts": lines.join("\n") });
    gitCommitAll(repo, "Начало", "2026-09-16T10:00:00Z");
    await run(["new", "--category", "bug", "--title", "Таймаут", "--source", "src/a.ts:3"]);
    expect((await loadBacklog(root)).tasks[0]?.anchor).toMatch(/^[0-9a-f]{12}@1-5$/);

    await writeFile(join(repo, "src/a.ts"), lines.map((line, index) => (index === 15 ? "changed" : line)).join("\n"));
    gitCommitAll(repo, "Правка далеко от задачи", "2026-09-17T15:00:00Z");

    expect((await run(["check", "--changed"])).out).toBe("Беклог в порядке");

    await writeFile(join(repo, "src/a.ts"), lines.map((line, index) => (index === 2 ? "changed near task" : line)).join("\n"));
    gitCommitAll(repo, "Правка в строках задачи", "2026-09-17T16:00:00Z");
    expect((await run(["check", "--changed"])).code).toBe(EXIT.needsReview);

    await run(["verify", "SPA-1"], { now: new Date("2026-09-17T17:00:00Z") });

    expect((await run(["check", "--changed"])).out).toBe("Беклог в порядке");
  });

  it("подтверждает несколько задач сразу; --source — только с одной", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "A"]);
    await run(["new", "--category", "bug", "--title", "B"]);

    const result = await run(["verify", "SPA-1", "SPA-2"], { now: new Date("2026-09-17T16:00:00Z") });

    expect(result).toMatchObject({ code: EXIT.ok, out: "SPA-1: подтверждена\nSPA-2: подтверждена" });
    expect((await loadBacklog(root)).tasks.every((task) => task.verified !== undefined)).toBe(true);
    expect((await run(["verify", "SPA-1", "SPA-2", "--source", "src/a.ts:1"])).code).toBe(EXIT.invalid);
  });

  it("verify при недоступном файле кода сохраняет прежний якорь", async () => {
    const { run, repo, root } = await makeCliSandbox();
    await writeFiles(repo, { "src/a.ts": "1\n" });
    gitCommitAll(repo, "Начало", "2026-09-16T10:00:00Z");
    await run(["new", "--category", "bug", "--title", "Таймаут", "--source", "src/a.ts:1"]);
    const anchor = (await loadBacklog(root)).tasks[0]?.anchor;
    expect(anchor).toMatch(/^[0-9a-f]{12}@/);

    await rm(join(repo, "src/a.ts"));
    await run(["verify", "SPA-1"], { now: new Date("2026-09-17T16:00:00Z") });

    expect((await loadBacklog(root)).tasks[0]?.anchor).toBe(anchor);
  });
});
