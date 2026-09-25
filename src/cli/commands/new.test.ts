import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadBacklog } from "../../core/store/load";
import { readJournal } from "../../core/store/journal";
import { gitAddWorktree, gitCommitAll, makeGitRepo, writeFiles } from "../../core/store/testing/temp-dirs";
import { EXIT } from "../io";
import { makeCliSandbox } from "../testing/cli-harness";

describe("backlog new", () => {
  it("похожая открытая задача — отказ с её ID, --force создаёт всё равно, закрытая не мешает", async () => {
    const { run } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Таймаут загрузки не учитывает размер файла", "--source", "src/upload.ts:88"]);

    const sameSource = await run(["new", "--category", "bug", "--title", "Совсем другое описание", "--source", "src/upload.ts:88"]);
    const sameTitle = await run(["new", "--category", "bug", "--title", "Загрузка: таймаут не учитывает размер файла"]);

    expect(sameSource).toMatchObject({ code: EXIT.refused, out: "" });
    expect(sameSource.err).toBe("Похоже на SPA-1 — «Таймаут загрузки не учитывает размер файла» (тот же source). Если это другая задача — добавьте --force");
    expect(sameTitle.err).toContain("(похожий заголовок)");
    expect((await run(["new", "--category", "bug", "--title", "Совсем другое описание", "--source", "src/upload.ts:88", "--force"])).code).toBe(EXIT.ok);

    await run(["status", "SPA-1", "cancelled"]);
    expect((await run(["new", "--category", "bug", "--title", "Загрузка: таймаут не учитывает размер файла"])).code).toBe(EXIT.ok);
  });

  it("создаёт проект по git-корню и задачу с описанием из stdin", async () => {
    const { run, root, repo } = await makeCliSandbox();
    await mkdir(join(repo, "src"));

    const result = await run(
      ["new", "--category", "bug", "--title", "Таймауты загрузки", "--priority", "high", "--tags", "upload, network", "--source", "src/a.ts:10"],
      { cwd: join(repo, "src"), stdin: "Описание\n\n## Чеклист\n- [ ] шаг\n" },
    );

    expect(result).toEqual({ code: EXIT.ok, out: `SPA-1 ${join(root, "spa/SPA-1.md")}`, err: "Создан проект spa (SPA)" });
    const text = await readFile(join(root, "spa/SPA-1.md"), "utf8");
    expect(text).toContain("tags: [upload, network]");
    expect(text).toContain("source: src/a.ts:10");
    expect(text).toContain("- [ ] шаг");
    expect((await loadBacklog(root)).projects[0]?.repos).toEqual([repo]);
  });

  it("второй вызов использует существующий проект, --json печатает задачу", async () => {
    const { run } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Первая", "--source", "src/a.ts:1"]);

    const result = await run(["new", "--category", "bug", "--title", "Вторая", "--related", "SPA-1", "--source", "src/b.ts:2", "--json"]);

    expect(result.code).toBe(EXIT.ok);
    expect(result.err).toBe("");
    expect(JSON.parse(result.out)).toMatchObject({ id: "SPA-2", related: ["SPA-1"], projectId: "spa" });
    expect(JSON.parse(result.out)).toEqual(JSON.parse((await run(["show", "SPA-2", "--json"])).out));
  });

  it("ошибки аргументов и правил — код 1, неизвестный --project — код 2", async () => {
    const { run } = await makeCliSandbox();
    expect((await run(["new"])).code).toBe(EXIT.invalid);
    const noCategory = await run(["new", "--title", "Без категории"]);
    expect(noCategory).toMatchObject({ code: EXIT.invalid, err: expect.stringContaining("--category обязателен") });
    expect((await run(["new", "--title", "Эпик без категории", "--type", "epic"])).code).toBe(EXIT.ok);
    expect((await run(["new", "--category", "bug", "--title", "X", "--priority", "urgent"])).err).toContain("--priority");
    expect((await run(["new", "--category", "bug", "--title", "X", "--unknown"])).code).toBe(EXIT.invalid);
    expect(await run(["new", "--category", "bug", "--title", "Заголовок", "без", "кавычек"])).toMatchObject({
      code: EXIT.invalid,
      err: expect.stringMatching(/^Лишние аргументы: без кавычек\nИспользование:/),
    });
    expect(await run(["new", "--category", "bug", "--title", "X", "--epic", "SPA-40"])).toMatchObject({
      code: EXIT.invalid,
      err: expect.stringContaining("эпик SPA-40 не найден"),
    });
    expect((await run(["new", "--category", "bug", "--title", "X", "--project", "nope"])).code).toBe(EXIT.notFound);
  });

  it("категория, как найдена и происхождение попадают в файл и журнал", async () => {
    const { run, root, repo } = await makeCliSandbox();
    await writeFiles(repo, { "a.ts": "x" });
    gitCommitAll(repo, "начало", "2026-09-17T10:00:00+03:00");
    const branch = execFileSync("git", ["-C", repo, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim();
    const commit = execFileSync("git", ["-C", repo, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();

    const result = await run(["new", "--title", "X", "--category", "couplers", "--found", "review"]);

    expect(result.code).toBe(0);
    const [created] = (await readJournal(join(root, "spa"), "spa")).events;
    expect(created).toMatchObject({ kind: "created", category: "couplers", found: "review", origin: { branch, commit } });
  });

  it("без коммитов происхождения нет, по умолчанию — найдена попутно", async () => {
    const { run, root } = await makeCliSandbox();

    await run(["new", "--category", "bug", "--title", "X"]);

    const [created] = (await readJournal(join(root, "spa"), "spa")).events;
    expect(created).toMatchObject({ kind: "created", found: "incidental" });
    expect(created).not.toHaveProperty("origin");
  });

  it("задача в чужой проект из другого репозитория — без происхождения", async () => {
    const { run, root, repo, home } = await makeCliSandbox();
    await writeFiles(repo, { "a.ts": "a\n" });
    gitCommitAll(repo, "Начало", "2026-09-16T10:00:00Z");
    await run(["new", "--category", "bug", "--title", "Первая"]);
    const other = await makeGitRepo(home, "projects/other");
    await writeFiles(other, { "b.ts": "b\n" });
    gitCommitAll(other, "Начало other", "2026-09-16T10:00:00Z");

    await run(["new", "--category", "bug", "--title", "Вторая", "--project", "spa"], { cwd: other });

    const events = (await readJournal(join(root, "spa"), "spa")).events;
    expect(events[0]).toHaveProperty("origin");
    expect(events[1]).not.toHaveProperty("origin");
  });

  it("вне git происхождения нет", async () => {
    const { run, root, home } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Первая"]);

    await run(["new", "--category", "bug", "--title", "Вторая", "--project", "spa"], { cwd: home });

    const events = (await readJournal(join(root, "spa"), "spa")).events;
    expect(events[1]).not.toHaveProperty("origin");
  });

  it("вне git проект не создаётся: иначе он поглотил бы все репозитории внутри каталога", async () => {
    const { run, root, home } = await makeCliSandbox();

    const result = await run(["new", "--category", "bug", "--title", "Первая"], { cwd: home });

    expect(result.code).toBe(EXIT.notFound);
    expect((await loadBacklog(root)).projects).toEqual([]);
  });

  it("пока project.md не разбирается, новый проект не создаётся: иначе его префикс и номера повторились бы", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Первая", "--source", "src/a.ts:1"]);
    await writeFiles(root, { "spa/project.md": "---\nname: spa\nprefix: SPA\nrepos: [\n---\n" });

    const result = await run(["new", "--category", "bug", "--title", "Вторая", "--source", "src/b.ts:1"]);

    expect(result.code).toBe(EXIT.notFound);
    expect(result.err).toContain(join(root, "spa/project.md"));
    expect(await readdir(root)).not.toContain("spa-2");
  });

  it("якорь --source из git worktree считается по файлу этого worktree, а не основного checkout", async () => {
    const { run, root, repo, home } = await makeCliSandbox();
    await writeFiles(repo, { "a.ts": "x" });
    gitCommitAll(repo, "начало", "2026-09-17T10:00:00+03:00");
    await run(["new", "--category", "bug", "--title", "Первая", "--source", "a.ts:1"]);
    const worktree = join(home, "projects/spa-feature");
    gitAddWorktree(repo, worktree, "feature");
    await writeFiles(worktree, { "a.ts": "x\ny\nz\n" });
    gitCommitAll(worktree, "ветка", "2026-09-17T11:00:00+03:00");

    await run(["new", "--category", "bug", "--title", "Только в ветке", "--source", "a.ts:3"], { cwd: worktree });

    expect((await loadBacklog(root)).tasks.find((task) => task.id === "SPA-2")?.anchor).toBeDefined();
  });

  it("из git worktree вне основного репозитория пишет в проект основного, а не создаёт новый", async () => {
    const { run, root, repo, home } = await makeCliSandbox();
    await writeFiles(repo, { "a.ts": "x" });
    gitCommitAll(repo, "начало", "2026-09-17T10:00:00+03:00");
    await run(["new", "--category", "bug", "--title", "Первая", "--source", "a.ts:1"]);
    const worktree = join(home, "projects/spa-feature");
    gitAddWorktree(repo, worktree, "feature");

    const result = await run(["new", "--category", "bug", "--title", "Из worktree", "--source", "a.ts:1", "--force"], { cwd: worktree });

    expect(result).toEqual({ code: EXIT.ok, out: `SPA-2 ${join(root, "spa/SPA-2.md")}`, err: "" });
    expect((await loadBacklog(root)).projects.map((project) => project.id)).toEqual(["spa"]);
  });

  it("битый project.md чужого репозитория не мешает завести проект, а его префикс не повторяется", async () => {
    const { run, root } = await makeCliSandbox();
    await writeFiles(root, { "other/project.md": "---\nname: other\nprefix: SPA\nrepos: [/work/other\n---\n" });

    const result = await run(["new", "--category", "bug", "--title", "Первая", "--source", "src/a.ts:1"]);

    expect(result.code).toBe(EXIT.ok);
    expect((await loadBacklog(root)).projects).toEqual([expect.objectContaining({ id: "spa", prefix: "SPA2" })]);
  });

  it("битый project.md соседа, чей путь продолжает путь этого репозитория, не мешает завести проект", async () => {
    const { run, root, repo } = await makeCliSandbox();
    await writeFiles(root, { "other/project.md": `---\nname: other\nprefix: OT\nrepos: [${repo}-backlog\n---\n` });

    const result = await run(["new", "--category", "bug", "--title", "Первая", "--source", "src/a.ts:1"]);

    expect(result.code).toBe(EXIT.ok);
  });

  it("битый project.md со своим путём среди repos останавливает создание проекта", async () => {
    const { run, root, repo } = await makeCliSandbox();
    await writeFiles(root, { "other/project.md": `---\nname: other\nprefix: OT\nrepos: [/work/x, ${repo}/]\n  bad\n---\n` });

    const result = await run(["new", "--category", "bug", "--title", "Первая", "--source", "src/a.ts:1"]);

    expect(result.code).toBe(EXIT.notFound);
  });

  it("битый project.md со своим путём, в котором есть пробел, останавливает создание проекта", async () => {
    const { run, root, home } = await makeCliSandbox();
    const spaced = join(home, "My Projects", "app");
    await mkdir(spaced, { recursive: true });
    execFileSync("git", ["init", "-q", "-b", "master"], { cwd: spaced });
    await writeFiles(root, { "other/project.md": `---\nname: other\nprefix: OT\nrepos: [${spaced}]\n  bad\n---\n` });

    const result = await run(["new", "--category", "bug", "--title", "Первая", "--source", "src/a.ts:1"], { cwd: spaced });

    expect(result.code).toBe(EXIT.notFound);
  });

  it("неизвестные категория и «как найдена» — код 1", async () => {
    const { run } = await makeCliSandbox();

    expect((await run(["new", "--title", "X", "--category", "spaghetti"])).code).toBe(1);
    expect((await run(["new", "--category", "bug", "--title", "X", "--found", "maybe"])).code).toBe(1);
  });

  it("баг без --source создаётся, но с предупреждением", async () => {
    const { run } = await makeCliSandbox();

    const created = await run(["new", "--category", "bug", "--title", "Падает на пустом ответе"]);

    expect(created.code).toBe(EXIT.ok);
    expect(created.err).toContain("У бага нет --source");
    expect((await run(["new", "--category", "bug", "--title", "Другой", "--source", "src/a.ts:1"])).err).toBe("");
  });
});
