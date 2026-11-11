import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { anchorOf } from "../../core/check/anchor";
import type { CheckReport } from "../../core/check/check-backlog";
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
  });
});
