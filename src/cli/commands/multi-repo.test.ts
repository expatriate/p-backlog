import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { anchorOf } from "../../core/check/anchor";
import type { CheckReport } from "../../core/check/check-backlog";
import { JOURNAL_FILE, readJournal } from "../../core/store/journal";
import { loadBacklog } from "../../core/store/load";
import { gitAddWorktree, gitCommitAll, gitShortHead, makeGitRepo, projectFile, taskFile, writeFiles } from "../../core/store/testing/temp-dirs";
import { EXIT } from "../io";
import { makeCliSandbox, type CliSandbox } from "../testing/cli-harness";

const WEB_CODE = "const web = 1;\nconst retries = 3;\nconst done = true;\n";
const API_CODE = "const api = 1;\nconst timeout = 30;\nconst port = 80;\n";
const WEB_INDEX = "import { mount } from './web';\nmount(document.body);\nexport const ready = true;\n";
const API_INDEX = "import { listen } from './api';\nlisten(8080);\nexport const started = true;\n";
const SHARED_CODE = "export const retries = 3;\nexport const timeoutMs = 30000;\nexport const backoff = 2;\n";

async function twoRepoSandbox() {
  const sandbox = await makeCliSandbox();
  const web = sandbox.repo;
  const api = await makeGitRepo(sandbox.home, "projects/api");
  await writeFiles(web, { "src/web.ts": WEB_CODE, "src/index.ts": WEB_INDEX, "src/shared.ts": SHARED_CODE, "package.json": '{ "name": "web" }\n' });
  gitCommitAll(web, "Веб", "2026-09-16T10:00:00Z");
  await writeFiles(api, { "src/api.ts": API_CODE, "src/index.ts": API_INDEX, "src/shared.ts": SHARED_CODE, "package.json": '{ "name": "api" }\n' });
  gitCommitAll(api, "API", "2026-09-16T10:00:00Z");
  await writeFiles(sandbox.root, { "spa/project.md": projectFile("SPA", [web, api]) });
  return { ...sandbox, web, api };
}

async function withTasksInBothRepos() {
  const sandbox = await twoRepoSandbox();
  await sandbox.run(["new", "--category", "bug", "--title", "Ретраи веба", "--source", "src/web.ts:2"], { cwd: sandbox.web });
  await sandbox.run(["new", "--category", "bug", "--title", "Таймаут API", "--source", "src/api.ts:2"], { cwd: sandbox.api });
  return sandbox;
}

async function checkFrom(run: CliSandbox["run"], cwd: string): Promise<CheckReport> {
  return JSON.parse((await run(["check", "--json"], { cwd })).out) as CheckReport;
}

async function journalEvents(root: string) {
  return (await readJournal(join(root, "spa"), "spa")).events;
}

async function withOriginIn(root: string, fromRepo: string, toRepo: string): Promise<void> {
  const journal = join(root, "spa", JOURNAL_FILE);
  await writeFile(journal, (await readFile(journal, "utf8")).replaceAll(gitShortHead(fromRepo), gitShortHead(toRepo)));
}

async function serverDeletedInWeb() {
  const sandbox = await twoRepoSandbox();
  await writeFiles(sandbox.web, { "src/server.ts": "const old = 1;\nconst legacy = 2;\n" });
  gitCommitAll(sandbox.web, "Старый сервер", "2026-09-16T11:00:00Z");
  execFileSync("git", ["rm", "-q", "src/server.ts"], { cwd: sandbox.web });
  gitCommitAll(sandbox.web, "Убрать сервер", "2026-09-16T12:00:00Z");
  await writeFiles(sandbox.api, { "src/server.ts": "const server = 1;\nconst keepAlive = 5;\n" });
  gitCommitAll(sandbox.api, "Сервер", "2026-09-16T12:00:00Z");
  return sandbox;
}

async function sharedTaskAnchoredInBoth() {
  const sandbox = await twoRepoSandbox();
  await writeFiles(sandbox.root, { "spa/SPA-1.md": taskFile("SPA-1", { title: "Таймаут общий", source: "src/shared.ts:2", anchor: anchorOf(SHARED_CODE, "src/shared.ts:2") ?? "" }) });
  await writeFiles(sandbox.web, { "src/shared.ts": `// настройки\n${SHARED_CODE}` });
  gitCommitAll(sandbox.web, "Заголовок", "2026-09-18T10:00:00Z");
  return sandbox;
}

async function savedTask(root: string, id: string) {
  return (await loadBacklog(root)).tasks.find((task) => task.id === id);
}

describe("проект с двумя repos", () => {
  it("задача каждого repo не пропавшая при проверке из любого repo", async () => {
    const { run, web, api } = await withTasksInBothRepos();

    const fromWeb = await checkFrom(run, web);
    const fromApi = await checkFrom(run, api);

    expect(fromWeb.candidates).toEqual([]);
    expect(fromApi.candidates).toEqual([]);
  });

  it("правка строки задачи второго repo даёт кандидата по якорю", async () => {
    const { run, web, api } = await withTasksInBothRepos();
    await writeFiles(api, { "src/api.ts": API_CODE.replace("timeout = 30", "timeout = 60") });
    gitCommitAll(api, "Таймаут от размера", "2026-09-18T10:00:00Z");

    const report = await checkFrom(run, web);

    expect(report.candidates).toEqual([expect.objectContaining({ kind: "source-changed", task: expect.objectContaining({ id: "SPA-2" }), method: "anchor", path: "src/api.ts" })]);
  });

  it("переименование файла во втором repo переносит source по истории этого repo, а не делает задачу пропавшей", async () => {
    const { run, root, web, api } = await withTasksInBothRepos();
    execFileSync("git", ["mv", "src/api.ts", "src/server.ts"], { cwd: api });
    gitCommitAll(api, "Переименовать", "2026-09-18T10:00:00Z");

    const report = await checkFrom(run, web);

    expect(report.candidates).toEqual([]);
    expect((await savedTask(root, "SPA-2"))?.source).toBe("src/server.ts:2");
  });

  it("close --as fixed находит коммит исправления во втором repo", async () => {
    const { run, web, api } = await withTasksInBothRepos();
    await writeFiles(api, { "src/api.ts": API_CODE.replace("timeout = 30", "timeout = 60") });
    gitCommitAll(api, "Таймаут от размера", "2026-09-18T10:00:00Z");

    const result = await run(["close", "SPA-2", "--as", "fixed", "--reason", `Исправлено в ${gitShortHead(api)}`], { cwd: web });

    expect(result.code).toBe(EXIT.ok);
  });

  it("new и verify --source из второго repo принимают его файл без предупреждения и считают якорь", async () => {
    const { run, root, api } = await twoRepoSandbox();

    const created = await run(["new", "--category", "bug", "--title", "Таймаут API", "--source", "src/api.ts:2"], { cwd: api });
    const verified = await run(["verify", "SPA-1", "--source", "src/api.ts:3"], { cwd: api });

    expect([created.code, created.err]).toEqual([EXIT.ok, ""]);
    expect([verified.code, verified.err]).toEqual([EXIT.ok, ""]);
    expect(await savedTask(root, "SPA-1")).toMatchObject({ source: "src/api.ts:3", anchor: expect.any(String) });
  });

  it("из linked worktree второго repo файл ветки берётся из этого worktree", async () => {
    const { run, root, home, api } = await twoRepoSandbox();
    const worktree = join(home, "projects/api-feature");
    gitAddWorktree(api, worktree, "feature");
    await writeFiles(worktree, { "src/feature.ts": "const feature = 1;\n" });
    gitCommitAll(worktree, "Фича", "2026-09-17T11:00:00Z");

    const created = await run(["new", "--category", "bug", "--title", "Фича API", "--source", "src/feature.ts:1"], { cwd: worktree });

    expect([created.code, created.err]).toEqual([EXIT.ok, ""]);
    expect((await savedTask(root, "SPA-1"))?.anchor).toBeDefined();
  });

  it("путь есть в обоих repos — задача судится по своему repo, а не по repo из cwd: правка строки в нём даёт кандидата с его коммитом", async () => {
    const { run, web, api } = await twoRepoSandbox();
    await run(["new", "--category", "bug", "--title", "Порт API", "--source", "src/index.ts:2"], { cwd: api });
    const untouched = await checkFrom(run, web);
    await writeFiles(api, { "src/index.ts": API_INDEX.replace("8080", "9090") });
    gitCommitAll(api, "Сменить порт", "2026-09-18T10:00:00Z");

    const report = await checkFrom(run, web);

    expect(untouched.candidates).toEqual([]);
    expect(report.candidates).toEqual([expect.objectContaining({ kind: "source-changed", task: expect.objectContaining({ id: "SPA-1" }), commits: [expect.objectContaining({ subject: "Сменить порт" })] })]);
  });

  it("одинаковый файл в обоих repos: правка строки задачи в её repo даёт кандидата при проверке из любого repo", async () => {
    const { run, web, api } = await twoRepoSandbox();
    await run(["new", "--category", "bug", "--title", "Таймаут общий", "--source", "src/shared.ts:2"], { cwd: api });
    await writeFiles(api, { "src/shared.ts": SHARED_CODE.replace("30000", "60000") });
    gitCommitAll(api, "Таймаут от размера", "2026-09-18T10:00:00Z");

    const fromApi = await checkFrom(run, api);
    const fromWeb = await checkFrom(run, web);

    const changed = [expect.objectContaining({ kind: "source-changed", task: expect.objectContaining({ id: "SPA-1" }) })];
    expect(fromApi.candidates).toEqual(changed);
    expect(fromWeb.candidates).toEqual(changed);
  });

  it("источник-файл без строк есть в обоих repos: правка в чужом repo не даёт кандидата задаче", async () => {
    const { run, web, api } = await twoRepoSandbox();
    await run(["new", "--category", "bug", "--title", "Зависимости API", "--source", "package.json"], { cwd: api });
    await writeFiles(web, { "package.json": '{ "name": "web", "private": true }\n' });
    gitCommitAll(web, "Веб приватный", "2026-09-18T10:00:00Z");

    const report = await checkFrom(run, web);

    expect(report.candidates).toEqual([]);
  });

  it("файл удалён в repo задачи и переименован в другом repo — source не переносится на чужой файл", async () => {
    const { run, root, web, api } = await twoRepoSandbox();
    await run(["new", "--category", "bug", "--title", "Таймаут общий", "--source", "src/shared.ts:2"], { cwd: api });
    execFileSync("git", ["rm", "-q", "src/shared.ts"], { cwd: api });
    gitCommitAll(api, "Убрать общий модуль", "2026-09-18T10:00:00Z");
    execFileSync("git", ["mv", "src/shared.ts", "src/settings.ts"], { cwd: web });
    gitCommitAll(web, "Переименовать", "2026-09-18T10:00:00Z");

    const report = await checkFrom(run, web);

    expect((await savedTask(root, "SPA-1"))?.source).toBe("src/shared.ts:2");
    expect(report.candidates).toEqual([expect.objectContaining({ kind: "source-missing", task: expect.objectContaining({ id: "SPA-1" }) })]);
  });

  it("verify без --source из чужого repo не переписывает якорь задачи", async () => {
    const { run, root, web, api } = await twoRepoSandbox();
    await run(["new", "--category", "bug", "--title", "Порт API", "--source", "src/index.ts:2"], { cwd: api });
    const anchor = (await savedTask(root, "SPA-1"))?.anchor;

    const verified = await run(["verify", "SPA-1"], { cwd: web });

    expect(verified.code).toBe(EXIT.ok);
    expect((await savedTask(root, "SPA-1"))?.anchor).toBe(anchor);
  });

  it("new --source с путём из обоих repos считает якорь по repo, где запущен", async () => {
    const { run, root, api } = await twoRepoSandbox();

    await run(["new", "--category", "bug", "--title", "Порт API", "--source", "src/index.ts:2"], { cwd: api });

    expect((await savedTask(root, "SPA-1"))?.anchor).toBe(anchorOf(API_INDEX, "src/index.ts:2"));
  });

  it("new --source с путём из обоих repos вне их checkout не пишет якорь", async () => {
    const { run, root, home } = await twoRepoSandbox();

    const created = await run(["new", "--category", "bug", "--title", "Точка входа", "--source", "src/index.ts:2", "--project", "spa"], { cwd: home });

    expect(created.code).toBe(EXIT.ok);
    expect((await savedTask(root, "SPA-1"))?.anchor).toBeUndefined();
  });

  it("путь есть в обоих repos, якоря нет — первый якорь по repo из cwd не пишется", async () => {
    const { run, root, web } = await twoRepoSandbox();
    await writeFiles(root, { "spa/SPA-1.md": taskFile("SPA-1", { title: "Точка входа", source: "src/index.ts:2" }) });

    await checkFrom(run, web);

    expect((await savedTask(root, "SPA-1"))?.anchor).toBeUndefined();
  });

  it("без origin файл удалён в одном repo и переименован в другом — source не переносится, repo не определён", async () => {
    const { run, root, web, api } = await twoRepoSandbox();
    await writeFiles(root, { "spa/SPA-1.md": taskFile("SPA-1", { title: "Таймаут общий", source: "src/shared.ts:2", anchor: anchorOf(SHARED_CODE, "src/shared.ts:2") ?? "" }) });
    execFileSync("git", ["rm", "-q", "src/shared.ts"], { cwd: api });
    gitCommitAll(api, "Убрать общий модуль", "2026-09-18T10:00:00Z");
    execFileSync("git", ["mv", "src/shared.ts", "src/settings.ts"], { cwd: web });
    gitCommitAll(web, "Переименовать", "2026-09-18T10:00:00Z");

    await checkFrom(run, web);

    expect((await savedTask(root, "SPA-1"))?.source).toBe("src/shared.ts:2");
  });

  it("verify без --source из другого repo переносит source по repo задачи", async () => {
    const { run, root, web, api } = await twoRepoSandbox();
    await run(["new", "--category", "bug", "--title", "Таймаут общий", "--source", "src/shared.ts:2"], { cwd: api });
    await writeFiles(api, { "src/shared.ts": `// настройки\n${SHARED_CODE}` });
    gitCommitAll(api, "Заголовок", "2026-09-18T10:00:00Z");

    await run(["verify", "SPA-1"], { cwd: web });

    expect(await savedTask(root, "SPA-1")).toMatchObject({ source: "src/shared.ts:3", anchor: anchorOf(`// настройки\n${SHARED_CODE}`, "src/shared.ts:3") });
  });

  it("verify без --source задачи без origin и якоря, путь в обоих repos — якорь по repo из cwd не пишется", async () => {
    const { run, root, web } = await twoRepoSandbox();
    await writeFiles(root, { "spa/SPA-1.md": taskFile("SPA-1", { title: "Точка входа", source: "src/index.ts:2" }) });

    const verified = await run(["verify", "SPA-1"], { cwd: web });

    expect(verified.code).toBe(EXIT.ok);
    expect((await savedTask(root, "SPA-1"))?.anchor).toBeUndefined();
    expect((await journalEvents(root)).find((event) => event.kind === "verified")).not.toHaveProperty("commit");
  });

  it("verify из другого repo записывает в журнал коммит HEAD repo задачи", async () => {
    const { run, root, web, api } = await twoRepoSandbox();
    await run(["new", "--category", "bug", "--title", "Порт API", "--source", "src/index.ts:2"], { cwd: api });

    await run(["verify", "SPA-1"], { cwd: web });

    const verified = (await readJournal(join(root, "spa"), "spa")).events.find((event) => event.kind === "verified");
    expect(verified).toMatchObject({ commit: gitShortHead(api) });
  });

  it("verify --source из другого repo переносит задачу в него: дальше она судится по этому repo, а не по repo создания", async () => {
    const { run, root, web, api } = await twoRepoSandbox();
    await run(["new", "--category", "bug", "--title", "Точка входа", "--source", "src/index.ts:2"], { cwd: api });
    await run(["verify", "SPA-1", "--source", "src/index.ts:2"], { cwd: web, now: new Date("2026-09-17T16:00:00Z") });
    await writeFiles(api, { "src/index.ts": API_INDEX.replace("8080", "9090") });
    gitCommitAll(api, "Сменить порт", "2026-09-18T10:00:00Z");

    const report = await checkFrom(run, api);

    expect(report.candidates).toEqual([]);
    expect((await savedTask(root, "SPA-1"))?.anchor).toBe(anchorOf(WEB_INDEX, "src/index.ts:2"));
  });

  it("new из repo, где файл когда-то был, записывает origin repo с файлом: задача не пропавшая, verify из этого repo пишет его коммит", async () => {
    const { run, root, web, api } = await serverDeletedInWeb();
    await run(["new", "--category", "bug", "--title", "Keep-alive", "--source", "src/server.ts:2"], { cwd: web });

    const fromWeb = await checkFrom(run, web);
    const fromApi = await checkFrom(run, api);
    await run(["verify", "SPA-1"], { cwd: api });

    const events = await journalEvents(root);
    expect([...fromWeb.candidates, ...fromApi.candidates]).toEqual([]);
    expect(events.find((event) => event.kind === "created")).toMatchObject({ origin: { commit: gitShortHead(api) } });
    expect(events.find((event) => event.kind === "verified")).toMatchObject({ commit: gitShortHead(api) });
  });

  it("старая задача с origin из repo, где файл удалён, судится по repo, где сходится её якорь", async () => {
    const { run, root, web, api } = await serverDeletedInWeb();
    await run(["new", "--category", "bug", "--title", "Keep-alive", "--source", "src/server.ts:2"], { cwd: api });
    await withOriginIn(root, api, web);

    const report = await checkFrom(run, web);

    expect(report.candidates).toEqual([]);
  });

  it("origin из repo, где пути никогда не было, не делает задачу без якоря пропавшей", async () => {
    const { run, root, web, api } = await twoRepoSandbox();
    await run(["new", "--category", "bug", "--title", "Ретраи веба", "--source", "src/web.ts"], { cwd: web });
    await withOriginIn(root, web, api);

    const report = await checkFrom(run, api);

    expect(report.candidates).toEqual([]);
  });

  it("якорь сходится в обоих repos — check не переносит source по repo из cwd", async () => {
    const { run, root, web } = await sharedTaskAnchoredInBoth();

    await checkFrom(run, web);

    expect((await savedTask(root, "SPA-1"))?.source).toBe("src/shared.ts:2");
  });

  it("якорь сходится в обоих repos — verify без --source не переносит source и не пишет коммит", async () => {
    const { run, root, web } = await sharedTaskAnchoredInBoth();

    const verified = await run(["verify", "SPA-1"], { cwd: web });

    expect(verified.code).toBe(EXIT.ok);
    expect((await savedTask(root, "SPA-1"))?.source).toBe("src/shared.ts:2");
    expect((await journalEvents(root)).find((event) => event.kind === "verified")).not.toHaveProperty("commit");
  });

  it("коммит origin есть в обоих repos — repo задачи решает её якорь, а не repo из cwd", async () => {
    const sandbox = await makeCliSandbox();
    const web = sandbox.repo;
    await writeFiles(web, { "src/index.ts": API_INDEX });
    gitCommitAll(web, "Начало", "2026-09-16T10:00:00Z");
    const api = join(sandbox.home, "projects/api");
    execFileSync("git", ["clone", "-q", web, api]);
    await writeFiles(sandbox.root, { "spa/project.md": projectFile("SPA", [web, api]) });
    await sandbox.run(["new", "--category", "bug", "--title", "Порт API", "--source", "src/index.ts:2"], { cwd: api });
    await writeFiles(web, { "src/index.ts": API_INDEX.replace("8080", "3000") });
    gitCommitAll(web, "Порт веба", "2026-09-18T10:00:00Z");

    const report = await checkFrom(sandbox.run, web);

    expect(report.candidates).toEqual([]);
  });

  it("история repo не читается — пропажа файла не определена, и задача не становится пропавшей по другому repo", async () => {
    const { run, root, web, api } = await twoRepoSandbox();
    await writeFiles(root, { "spa/SPA-1.md": taskFile("SPA-1", { title: "Пропавший модуль", source: "src/gone.ts:1" }) });
    await writeFiles(api, { ".git/refs/heads/broken": `${"1".repeat(40)}\n` });

    const report = await checkFrom(run, web);

    expect(report.candidates.filter((candidate) => candidate.kind === "source-missing")).toEqual([]);
  });

  it("старая задача без якоря с origin из repo, где файл удалён, а он есть в другом repo, — verify не закрепляет repo origin", async () => {
    const { run, root, web, api } = await serverDeletedInWeb();
    await run(["new", "--category", "bug", "--title", "Сервер целиком", "--source", "src/server.ts"], { cwd: api });
    await withOriginIn(root, api, web);

    await run(["verify", "SPA-1"], { cwd: api });

    expect((await journalEvents(root)).find((event) => event.kind === "verified")).not.toHaveProperty("commit");
  });

  it("история repo не читается — verify не записывает коммит ни для задачи с origin, ни без него", async () => {
    const { run, root, web, api } = await twoRepoSandbox();
    await run(["new", "--category", "bug", "--title", "Таймаут API", "--source", "src/api.ts:2"], { cwd: api });
    await writeFiles(root, { "spa/SPA-2.md": taskFile("SPA-2", { title: "Пропавший модуль", source: "src/gone.ts:1" }) });
    execFileSync("git", ["rm", "-q", "src/api.ts"], { cwd: api });
    gitCommitAll(api, "Убрать API", "2026-09-18T10:00:00Z");
    await writeFiles(api, { ".git/refs/heads/broken": `${"1".repeat(40)}\n` });

    await run(["verify", "SPA-1", "SPA-2"], { cwd: web });

    expect((await journalEvents(root)).filter((event) => event.kind === "verified")).toEqual([
      expect.not.objectContaining({ commit: expect.anything() }),
      expect.not.objectContaining({ commit: expect.anything() }),
    ]);
  });
});
