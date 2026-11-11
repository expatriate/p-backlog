import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { CheckReport } from "../../core/check/check-backlog";
import type { Language } from "../../core/i18n/language";
import { writeSettings } from "../../core/store/settings";
import { gitAddWorktree, gitCheckout, gitCommitAll, gitMergeFastForward, gitMergeNoFastForward, makeGitRepo, writeFiles } from "../../core/store/testing/temp-dirs";
import { toJsonLines } from "../../core/store/json-lines";
import { JOURNAL_FILE, readJournal } from "../../core/store/journal";
import { loadBacklog } from "../../core/store/load";
import { EXIT } from "../io";
import { makeCliSandbox } from "../testing/cli-harness";
import { failOnPathError } from "../../core/store/testing/path-errors";

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
  it("задачи про код ещё не слитой ветки не судятся в основном checkout, а после слияния — судятся без ложных кандидатов", async () => {
    const { run, repo, home } = await makeCliSandbox();
    await writeFiles(repo, { "src/a.ts": "const a = 1;\nconst timeout = 30;\nconst b = 2;\n" });
    gitCommitAll(repo, "Начало", "2026-09-16T10:00:00Z");
    await run(["new", "--category", "bug", "--title", "Прогрев проекта"]);
    const worktree = join(home, "projects/spa-feat");
    gitAddWorktree(repo, worktree, "feat");
    await writeFiles(worktree, { "src/a.ts": "import x from 'x';\nimport y from 'y';\nconst a = 1;\nconst timeout = 30;\nconst b = 2;\n", "src/n.ts": "new file\nline2\n" });
    gitCommitAll(worktree, "Фича", "2026-09-16T11:00:00Z");
    await run(["new", "--category", "bug", "--title", "Таймаут в ветке", "--source", "src/a.ts:4"], { cwd: worktree });
    await run(["new", "--category", "bug", "--title", "Новый файл в ветке", "--source", "src/n.ts:1"], { cwd: worktree });

    const beforeMerge = JSON.parse((await run(["check", "--json"])).out) as CheckReport;
    gitMergeNoFastForward(repo, "feat", "2026-09-17T10:00:00Z");
    const afterMerge = JSON.parse((await run(["check", "--json"])).out) as CheckReport;

    expect(beforeMerge.candidates.filter((candidate) => candidate.kind !== "duplicate")).toEqual([]);
    expect(afterMerge.candidates.filter((candidate) => candidate.kind !== "duplicate")).toEqual([]);
    expect([...beforeMerge.fixed, ...afterMerge.fixed]).toEqual([]);
  });

  it("проверка из git worktree не переносит source задачи на строки ветки: главный якорь — основной checkout", async () => {
    const { run, repo, root, home } = await makeCliSandbox();
    await writeFiles(repo, { "src/a.ts": "const a = 1;\nconst timeout = 30;\n" });
    gitCommitAll(repo, "Начало", "2026-09-16T10:00:00Z");
    await run(["new", "--category", "bug", "--title", "Таймаут", "--source", "src/a.ts:2"]);
    const worktree = join(home, "projects/spa-feature");
    gitAddWorktree(repo, worktree, "feature");
    await writeFile(join(worktree, "src/a.ts"), "import x from 'x';\n\nconst a = 1;\nconst timeout = 30;\n");
    gitCommitAll(worktree, "Импорт", "2026-09-18T10:00:00Z");

    const fromWorktree = JSON.parse((await run(["check", "--json"], { cwd: worktree })).out) as CheckReport;
    const fromMain = JSON.parse((await run(["check", "--json"])).out) as CheckReport;

    expect(fromWorktree.candidates).toEqual([]);
    expect([...fromWorktree.fixed, ...fromMain.fixed]).toEqual([]);
    expect((await loadBacklog(root)).tasks.find((task) => task.id === "SPA-1")?.source).toBe("src/a.ts:2");
  });

  it("задача без якоря, подтверждённая в основном checkout, не становится кандидатом в отставшем worktree, догнавшем master перемоткой", async () => {
    const { run, repo, home } = await makeCliSandbox();
    await writeFiles(repo, { "src/a.ts": "1\n" });
    gitCommitAll(repo, "Начало", "2026-09-16T10:00:00Z");
    await run(["new", "--category", "bug", "--title", "Таймаут", "--source", "src/a.ts"], { now: new Date("2026-09-16T11:00:00Z") });
    const worktree = join(home, "projects/spa-lane");
    gitAddWorktree(repo, worktree, "lane", "2026-09-16T12:00:00Z");
    await writeFile(join(repo, "src/a.ts"), "2\n");
    gitCommitAll(repo, "Поправить таймаут", "2026-09-17T10:00:00Z");
    await run(["verify", "SPA-1"], { now: new Date("2026-09-17T11:00:00Z") });
    const checkFromWorktree = async () => (JSON.parse((await run(["check", "--json"], { cwd: worktree })).out) as CheckReport).candidates;

    const beforeFastForward = await checkFromWorktree();
    gitMergeFastForward(worktree, "master", "2026-09-17T12:00:00Z");
    const afterFastForward = await checkFromWorktree();

    expect({ beforeFastForward, afterFastForward }).toEqual({ beforeFastForward: [], afterFastForward: [] });
  });

  it("задача без якоря, подтверждённая в worktree невлитой полосы, — правка из master, пришедшая перемоткой с датой до отметки, делает её кандидатом в основном checkout", async () => {
    const { run, repo, home } = await makeCliSandbox();
    await writeFiles(repo, { "src/a.ts": "1\n", "src/b.ts": "1\n" });
    gitCommitAll(repo, "Начало", "2026-09-16T10:00:00Z");
    await run(["new", "--category", "bug", "--title", "Таймаут", "--source", "src/a.ts"], { now: new Date("2026-09-16T11:00:00Z") });
    const worktree = join(home, "projects/spa-lane");
    gitAddWorktree(repo, worktree, "lane", "2026-09-16T12:00:00Z");
    await writeFile(join(worktree, "src/b.ts"), "2\n");
    gitCommitAll(worktree, "Работа полосы", "2026-09-16T13:00:00Z");
    gitCheckout(repo, "feat", { create: true, at: "2026-09-16T14:00:00Z" });
    await writeFile(join(repo, "src/a.ts"), "2\n");
    gitCommitAll(repo, "Поправить таймаут", "2026-09-16T15:00:00Z");
    gitCheckout(repo, "master", { at: "2026-09-16T16:00:00Z" });
    await run(["verify", "SPA-1"], { cwd: worktree, now: new Date("2026-09-17T11:00:00Z") });
    gitMergeFastForward(repo, "feat", "2026-09-17T12:00:00Z");

    const report = JSON.parse((await run(["check", "--json"])).out) as CheckReport;

    expect(report.candidates).toEqual([expect.objectContaining({ kind: "source-changed", path: "src/a.ts", commits: [expect.objectContaining({ subject: "Поправить таймаут" })] })]);
  });

  it("подтверждение без коммита (от прежней версии CLI) берёт базу из reflog, а не из коммита предыдущего подтверждения", async () => {
    const { run, repo, root } = await makeCliSandbox();
    await writeFiles(repo, { "src/a.ts": "1\n" });
    gitCommitAll(repo, "Начало", "2026-09-16T10:00:00Z");
    await run(["new", "--category", "bug", "--title", "Таймаут", "--source", "src/a.ts"], { now: new Date("2026-09-16T11:00:00Z") });
    await run(["verify", "SPA-1"], { now: new Date("2026-09-16T12:00:00Z") });
    await writeFile(join(repo, "src/a.ts"), "2\n");
    gitCommitAll(repo, "Поправить таймаут", "2026-09-17T10:00:00Z");
    await run(["verify", "SPA-1"], { now: new Date("2026-09-17T11:00:00Z") });
    const projectDir = join(root, "spa");
    const { events } = await readJournal(projectDir, "spa");
    const lastVerification = events.at(-1);
    await writeFile(join(projectDir, JOURNAL_FILE), toJsonLines(events.map((event) => (event === lastVerification ? { ...event, commit: undefined } : event))));

    const report = JSON.parse((await run(["check", "--json"])).out) as CheckReport;

    const recordedCommits = (await readJournal(projectDir, "spa")).events.flatMap((event) => (event.kind === "verified" ? [typeof event.commit] : []));
    expect({ recordedCommits, candidates: report.candidates }).toEqual({ recordedCommits: ["string", "undefined"], candidates: [] });
  });

  it("перечисляет кандидатов с уликами и завершается кодом 5", async () => {
    const { run } = await sandboxWithChangedSource();

    const result = await run(["check"]);

    expect(result.code).toBe(EXIT.needsReview);
    expect(result.out).toMatch(/^Кандидаты на закрытие:\n {2}SPA-1 — Таймаут: код менялся \(src\/a\.ts\): [0-9a-f]{7,} Поправить таймаут$/);
    expect((await run(["check", "--changed"])).code).toBe(EXIT.needsReview);
  });

  it("проблема настройки проекта видна в отчёте, но перепроверять нечего — код 0", async () => {
    const { run, root } = await makeCliSandbox();
    await writeFiles(root, { "docs/project.md": "---\nname: docs\nprefix: DOC\nrepos: []\n---\n" });

    const result = await run(["check", "--project", "docs", "--json"]);

    expect(result.code).toBe(EXIT.ok);
    expect(JSON.parse(result.out).problems).toEqual([{ kind: "project-without-repos", projectId: "docs" }]);
  });

  it("--json отдаёт отчёт целиком", async () => {
    const { run } = await sandboxWithChangedSource();

    const report = JSON.parse((await run(["check", "--json"])).out) as CheckReport;

    expect(report).toMatchObject({ fixed: [], problems: [], candidates: [{ kind: "source-changed", task: { id: "SPA-1" }, path: "src/a.ts" }] });
    expect(report.candidates[0]).toHaveProperty("snippet");
    expect(report.candidates[0]).not.toHaveProperty("codeState");
  });

  it("из git-хука linked worktree чужого репозитория судит код проекта, а не репозиторий хука", async () => {
    const { run, home } = await sandboxWithChangedSource();
    const hookRepo = await makeGitRepo(home, "projects/other");
    await writeFiles(hookRepo, { "src/a.ts": "1\n" });
    gitCommitAll(hookRepo, "Чужое начало", "2026-09-16T10:00:00Z");
    gitAddWorktree(hookRepo, join(home, "projects/other-x"), "x");
    onTestFinished(() => void vi.unstubAllEnvs());
    vi.stubEnv("GIT_DIR", join(hookRepo, ".git/worktrees/x"));
    vi.stubEnv("GIT_INDEX_FILE", join(hookRepo, ".git/worktrees/x/index"));

    const report = JSON.parse((await run(["check", "--json"])).out) as CheckReport;

    expect(report).toMatchObject({ problems: [], candidates: [{ kind: "source-changed", task: { id: "SPA-1" }, path: "src/a.ts", uncommitted: false }] });
  });

  it("--json от языка не зависит: исправления, проблемы и обрезанный diff — данные, а не фразы", async () => {
    const { run, root, repo } = await makeCliSandbox();
    await writeFiles(repo, { "src/a.ts": "1\n" });
    gitCommitAll(repo, "Начало", "2026-09-16T10:00:00Z");
    await run(["new", "--category", "bug", "--title", "Таймаут", "--source", "src/a.ts:1"]);
    await writeFile(join(repo, "src/a.ts"), Array.from({ length: 100 }, (_, index) => `line ${index}\n`).join(""));
    gitCommitAll(repo, "Переписать", "2026-09-18T10:00:00Z");
    const task = (id: string, fields: string) => `---\nid: ${id}\ntitle: ${id}\ncreated: 2026-09-17T10:00:00Z\n${fields}---\n`;
    const checkJsonIn = async (language: Language) => {
      await writeSettings(root, { language }, failOnPathError);
      await writeFiles(root, { "spa/SPA-2.md": task("SPA-2", "blockedBy: [SPA-40]\n"), "spa/SPA-3.md": task("SPA-3", "blockedBy: [SPA-3]\n") });
      return (await run(["check", "--json"])).out;
    };

    const ru = await checkJsonIn("ru");
    const en = await checkJsonIn("en");

    expect(en).toBe(ru);
    expect(JSON.parse(ru)).toMatchObject({
      fixed: [{ kind: "references-removed", taskId: "SPA-2", ids: ["SPA-40"] }],
      problems: [{ kind: "task-invalid", taskId: "SPA-3", problem: { code: "self-block" } }],
      candidates: [{ kind: "source-changed", task: { id: "SPA-1" }, diffOmittedLines: expect.any(Number) }],
    });
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
