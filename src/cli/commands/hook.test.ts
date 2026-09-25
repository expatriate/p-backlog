import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NBSP } from "../../core/i18n/plural";
import { readJournal } from "../../core/store/journal";
import { SIGNALS_SHOWN_FILE } from "../../core/store/signals-shown";
import { gitAddWorktree, gitCommitAll, writeFiles } from "../../core/store/testing/temp-dirs";
import { writeSettings } from "../../core/store/settings";
import { EXIT } from "../io";
import { makeCliSandbox } from "../testing/cli-harness";

async function changedTaskSandbox() {
  const sandbox = await makeCliSandbox();
  await writeFiles(sandbox.repo, { "src/a.ts": "1\n" });
  gitCommitAll(sandbox.repo, "Начало", "2026-09-16T10:00:00Z");
  await sandbox.run(["new", "--category", "bug", "--title", "Таймаут", "--source", "src/a.ts:1"]);
  await writeFile(join(sandbox.repo, "src/a.ts"), "2\n");
  gitCommitAll(sandbox.repo, "Поправить таймаут", "2026-09-18T10:00:00Z");
  return sandbox;
}

const EXPECTED_REASON =
  "Беклог spa: после последней проверки менялся код задач — SPA-1 (изменён src/a.ts). Перепроверь их по скиллу backlog, раздел «Перепроверить задачи».";

describe("backlog hook stop", () => {
  it("просит перепроверить задачи, чей код менялся", async () => {
    const { run, repo, root } = await makeCliSandbox();
    await writeFiles(repo, { "src/a.ts": "1\n" });
    gitCommitAll(repo, "Начало", "2026-09-16T10:00:00Z");
    await run(["new", "--category", "bug", "--title", "Таймаут", "--source", "src/a.ts:1"]);
    await writeFile(join(repo, "src/a.ts"), "2\n");
    gitCommitAll(repo, "Поправить таймаут", "2026-09-18T10:00:00Z");
    const event = (active: boolean) => JSON.stringify({ session_id: "s", cwd: repo, hook_event_name: "Stop", stop_hook_active: active });

    const blocked = await run(["hook", "stop"], { stdin: event(false) });

    expect(blocked.code).toBe(EXIT.ok);
    expect(JSON.parse(blocked.out)).toEqual({
      decision: "block",
      reason: "Беклог spa: после последней проверки менялся код задач — SPA-1 (изменён src/a.ts). Перепроверь их по скиллу backlog, раздел «Перепроверить задачи».",
    });
    expect((await run(["hook", "stop"], { stdin: event(true) })).out).toBe("");

    const journal = await readJournal(join(root, "spa"), "spa");
    expect(journal.events).toContainEqual(expect.objectContaining({ kind: "candidate", mode: "changed", via: "check" }));
  });

  it("молчит с кодом 0, если каталога сессии уже нет (агент удалил свой worktree)", async () => {
    const { run, home } = await makeCliSandbox();

    const result = await run(["hook", "stop"], { stdin: JSON.stringify({ session_id: "s", cwd: join(home, "projects/removed-worktree") }) });

    expect(result).toMatchObject({ code: EXIT.ok, out: "", err: "" });
  });

  it.skipIf(process.platform === "win32")("сбой чтения беклога не валит хук: предупреждение в stderr и код 0, чтобы Windows не показывал ошибку хука (на Windows chmod не запрещает чтение)", async () => {
    const { run, repo, root } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Таймаут"]);
    await chmod(join(root, "spa"), 0o000);
    try {
      const result = await run(["hook", "stop"], { stdin: JSON.stringify({ session_id: "s", cwd: repo }) });

      expect(result).toMatchObject({ code: EXIT.ok, out: "" });
      expect(result.err).toContain("EACCES");
    } finally {
      await chmod(join(root, "spa"), 0o755);
    }
  });

  it("в git worktree вне основного репозитория видит правку, закоммиченную в этом worktree", async () => {
    const { run, repo, home } = await makeCliSandbox();
    await writeFiles(repo, { "src/a.ts": "1\n" });
    gitCommitAll(repo, "Начало", "2026-09-16T10:00:00Z");
    await run(["new", "--category", "bug", "--title", "Таймаут", "--source", "src/a.ts:1"]);
    const worktree = join(home, "projects/spa-feature");
    gitAddWorktree(repo, worktree, "feature");
    await writeFile(join(worktree, "src/a.ts"), "2\n");
    gitCommitAll(worktree, "Поправить таймаут", "2026-09-18T10:00:00Z");

    const result = await run(["hook", "stop"], { stdin: JSON.stringify({ session_id: "s", cwd: worktree, hook_event_name: "Stop", stop_hook_active: false }) });

    expect(JSON.parse(result.out)).toMatchObject({ decision: "block", reason: expect.stringContaining("SPA-1") });
  });

  it("молчит, если событие не разобрать, у каталога нет проекта или кандидатов нет", async () => {
    const { run, repo, home } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "X"]);

    for (const stdin of ["не json", "{}", JSON.stringify({ cwd: home }), JSON.stringify({ cwd: repo })]) {
      expect(await run(["hook", "stop"], { stdin })).toEqual({ code: EXIT.ok, out: "", err: "" });
    }
    expect((await run(["hook", "start"])).code).toBe(EXIT.invalid);
  });

  it("показывает новую тревогу раз в день, без блокировки", async () => {
    const { run, repo, root } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Упало", "--priority", "critical"], { now: new Date(2026, 8, 1, 10) });
    const stdin = JSON.stringify({ session_id: "s", cwd: repo, hook_event_name: "Stop", stop_hook_active: false });

    const first = await run(["hook", "stop"], { stdin, now: new Date(2026, 8, 17, 10) });
    const again = await run(["hook", "stop"], { stdin, now: new Date(2026, 8, 17, 18) });
    const nextDay = await run(["hook", "stop"], { stdin, now: new Date(2026, 8, 18, 10) });

    expect(JSON.parse(first.out)).toEqual({ systemMessage: "Беклог spa: Срочные задачи ждут дольше 7 дней: 1" });
    expect(again.out).toBe("");
    expect(JSON.parse(nextDay.out)).toEqual({ systemMessage: "Беклог spa: Срочные задачи ждут дольше 7 дней: 1" });
    expect(JSON.parse(await readFile(join(root, "spa", SIGNALS_SHOWN_FILE), "utf8"))).toEqual({ "urgent-stale": "2026-09-18" });
  });

  it("вместе с кандидатами — и блокировка, и сообщение", async () => {
    const { run, repo } = await makeCliSandbox();
    await writeFiles(repo, { "src/a.ts": "1\n" });
    gitCommitAll(repo, "Начало", "2026-09-01T10:00:00Z");
    await run(["new", "--category", "bug", "--title", "Упало", "--priority", "critical", "--source", "src/a.ts:1"], { now: new Date("2026-09-01T10:00:00Z") });
    await writeFile(join(repo, "src/a.ts"), "2\n");
    gitCommitAll(repo, "Правка", "2026-09-16T10:00:00Z");
    const stdin = JSON.stringify({ session_id: "s", cwd: repo, hook_event_name: "Stop", stop_hook_active: false });

    const result = JSON.parse((await run(["hook", "stop"], { stdin })).out) as Record<string, string>;

    expect(result.decision).toBe("block");
    expect(result.systemMessage).toBe("Беклог spa: Срочные задачи ждут дольше 7 дней: 1");
  });

  it("занятая память сессии не отменяет блокировку: код 0, решение напечатано, предупреждение в stderr", { timeout: 20_000 }, async () => {
    const { run, repo, root } = await makeCliSandbox();
    await writeFiles(repo, { "src/a.ts": "1\n" });
    gitCommitAll(repo, "Начало", "2026-09-16T10:00:00Z");
    await run(["new", "--category", "bug", "--title", "Таймаут", "--source", "src/a.ts:1"]);
    await writeFile(join(repo, "src/a.ts"), "2\n");
    gitCommitAll(repo, "Правка", "2026-09-18T10:00:00Z");
    await writeFile(join(root, "spa", "..candidates-shown.json.lock"), "другой хук");

    const result = await run(["hook", "stop"], { stdin: JSON.stringify({ session_id: "s", cwd: repo, hook_event_name: "Stop", stop_hook_active: false }) });

    expect(result.code).toBe(EXIT.ok);
    expect(JSON.parse(result.out)).toMatchObject({ decision: "block" });
    expect(result.err).toContain("Не удалось запомнить показанные задачи сессии");
  });

  it("нечитаемый журнал не роняет хук: тревог нет, предупреждение в stderr", async () => {
    const { run, repo, root } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Упало", "--priority", "critical"], { now: new Date("2026-09-01T10:00:00Z") });
    await rm(join(root, "spa", "journal.jsonl"));
    await mkdir(join(root, "spa", "journal.jsonl"));
    const stdin = JSON.stringify({ session_id: "s", cwd: repo, hook_event_name: "Stop", stop_hook_active: false });

    const result = await run(["hook", "stop"], { stdin });

    expect(result.code).toBe(EXIT.ok);
    expect(result.out).toBe("");
    expect(result.err).toContain("Не удалось посчитать тревоги");
  });

  it("задачи с низким приоритетом не останавливают сессию: уведомление раз в день, полный check их видит", async () => {
    const { run, repo } = await makeCliSandbox();
    await writeFiles(repo, { "src/a.ts": "1\n", "src/b.ts": "1\n" });
    gitCommitAll(repo, "Начало", "2026-09-16T10:00:00Z");
    await run(["new", "--category", "bug", "--title", "Мелочь про форматирование", "--priority", "low", "--source", "src/a.ts:1"], { now: new Date("2026-09-16T11:00:00Z") });
    await writeFile(join(repo, "src/a.ts"), "2\n");
    gitCommitAll(repo, "Правка", "2026-09-17T10:00:00Z");
    const stdin = JSON.stringify({ session_id: "s", cwd: repo, hook_event_name: "Stop", stop_hook_active: false });

    const first = await run(["hook", "stop"], { stdin, now: new Date(2026, 8, 18, 10) });
    const again = await run(["hook", "stop"], { stdin, now: new Date(2026, 8, 18, 12) });

    expect(JSON.parse(first.out)).toEqual({ systemMessage: `Беклог spa: Код менялся у 1${NBSP}задачи с низким приоритетом — перепроверьте при случае («почисти беклог»)` });
    expect(again.out).toBe("");
    expect((await run(["check"])).out).toContain("SPA-1");

    await run(["new", "--category", "bug", "--title", "Важная ошибка загрузки", "--priority", "high", "--source", "src/b.ts:1"], { now: new Date("2026-09-16T11:00:00Z") });
    await writeFile(join(repo, "src/b.ts"), "2\n");
    gitCommitAll(repo, "Правка b", "2026-09-17T11:00:00Z");

    const mixed = JSON.parse((await run(["hook", "stop"], { stdin, now: new Date(2026, 8, 18, 14) })).out) as Record<string, string>;

    expect(mixed.decision).toBe("block");
    expect(mixed.reason).toContain("SPA-2");
    expect(mixed.reason).not.toContain("SPA-1");
  });

  it("в одной сессии задача называется один раз, в новой — снова", async () => {
    const { run, repo } = await makeCliSandbox();
    await writeFiles(repo, { "src/a.ts": "1\n" });
    gitCommitAll(repo, "Начало", "2026-09-16T10:00:00Z");
    await run(["new", "--category", "bug", "--title", "Таймаут", "--source", "src/a.ts:1"]);
    await writeFile(join(repo, "src/a.ts"), "2\n");
    gitCommitAll(repo, "Правка", "2026-09-18T10:00:00Z");
    const event = (session: string) => JSON.stringify({ session_id: session, cwd: repo, hook_event_name: "Stop", stop_hook_active: false });

    const first = await run(["hook", "stop"], { stdin: event("s1") });
    const second = await run(["hook", "stop"], { stdin: event("s1") });
    const nextSession = await run(["hook", "stop"], { stdin: event("s2") });

    expect(JSON.parse(first.out).decision).toBe("block");
    expect(second.out).toBe("");
    expect(JSON.parse(nextSession.out).decision).toBe("block");
  });

  it("параллельные сессии помнят сказанное независимо друг от друга", async () => {
    const { run, repo } = await makeCliSandbox();
    await writeFiles(repo, { "src/a.ts": "1\n" });
    gitCommitAll(repo, "Начало", "2026-09-16T10:00:00Z");
    await run(["new", "--category", "bug", "--title", "Таймаут", "--source", "src/a.ts:1"]);
    await writeFile(join(repo, "src/a.ts"), "2\n");
    gitCommitAll(repo, "Правка", "2026-09-18T10:00:00Z");
    const event = (session: string) => JSON.stringify({ session_id: session, cwd: repo, hook_event_name: "Stop", stop_hook_active: false });

    await run(["hook", "stop"], { stdin: event("s1") });
    await run(["hook", "stop"], { stdin: event("s2") });

    expect((await run(["hook", "stop"], { stdin: event("s1") })).out).toBe("");
    expect((await run(["hook", "stop"], { stdin: event("s2") })).out).toBe("");
  });

  it("файл памяти сессий не копит сессии старше недели", async () => {
    const { run, repo, root } = await makeCliSandbox();
    await writeFiles(repo, { "src/a.ts": "1\n" });
    gitCommitAll(repo, "Начало", "2026-09-16T10:00:00Z");
    await run(["new", "--category", "bug", "--title", "Таймаут", "--source", "src/a.ts:1"]);
    await writeFile(join(repo, "src/a.ts"), "2\n");
    gitCommitAll(repo, "Правка", "2026-09-18T10:00:00Z");
    const event = (session: string) => JSON.stringify({ session_id: session, cwd: repo, hook_event_name: "Stop", stop_hook_active: false });

    await run(["hook", "stop"], { stdin: event("old"), now: new Date(2026, 8, 18, 10) });
    await run(["hook", "stop"], { stdin: event("new"), now: new Date(2026, 8, 26, 10) });

    const stored = JSON.parse(await readFile(join(root, "spa/.candidates-shown.json"), "utf8")) as Record<string, unknown>;
    expect(Object.keys(stored)).toEqual(["new"]);
  });

  it("без session_id в событии глушения нет", async () => {
    const { run, repo } = await makeCliSandbox();
    await writeFiles(repo, { "src/a.ts": "1\n" });
    gitCommitAll(repo, "Начало", "2026-09-16T10:00:00Z");
    await run(["new", "--category", "bug", "--title", "Таймаут", "--source", "src/a.ts:1"]);
    await writeFile(join(repo, "src/a.ts"), "2\n");
    gitCommitAll(repo, "Правка", "2026-09-18T10:00:00Z");
    const stdin = JSON.stringify({ cwd: repo, hook_event_name: "Stop", stop_hook_active: false });

    expect(JSON.parse((await run(["hook", "stop"], { stdin })).out).decision).toBe("block");
    expect(JSON.parse((await run(["hook", "stop"], { stdin })).out).decision).toBe("block");
  });

  it("на языке en причина блокировки — на английском, с маркером Backlog", async () => {
    const { run, repo, root } = await makeCliSandbox();
    await writeSettings(root, { language: "en" });
    await writeFiles(repo, { "src/a.ts": "1\n" });
    gitCommitAll(repo, "Start", "2026-09-16T10:00:00Z");
    await run(["new", "--category", "bug", "--title", "Timeout", "--source", "src/a.ts:1"]);
    await writeFile(join(repo, "src/a.ts"), "2\n");
    gitCommitAll(repo, "Fix timeout", "2026-09-18T10:00:00Z");
    const stdin = JSON.stringify({ session_id: "s", cwd: repo, hook_event_name: "Stop", stop_hook_active: false });

    const blocked = await run(["hook", "stop"], { stdin });

    const reason = (JSON.parse(blocked.out) as { reason: string }).reason;
    expect(reason.startsWith("Backlog spa:")).toBe(true);
    expect(reason).not.toMatch(/[А-Яа-яЁё]/);
  });

  it("Codex получает тот же ответ, что и Claude Code", async () => {
    const { run, repo } = await changedTaskSandbox();
    const event = JSON.stringify({ session_id: "s", turn_id: "t1", cwd: repo, hook_event_name: "Stop", stop_hook_active: false, model: "gpt-5" });

    const result = await run(["hook", "stop", "--agent", "codex"], { stdin: event });

    expect(result.code).toBe(EXIT.ok);
    expect(JSON.parse(result.out)).toEqual({ decision: "block", reason: EXPECTED_REASON });
  });

  it("Cursor получает follow-up и не зацикливается на своём же follow-up", async () => {
    const { run, repo } = await changedTaskSandbox();
    const event = (loopCount: number, generation: string) =>
      JSON.stringify({ conversation_id: "c", generation_id: generation, workspace_roots: [repo], status: "completed", loop_count: loopCount, hook_event_name: "stop" });

    const first = await run(["hook", "stop", "--agent", "cursor"], { stdin: event(0, "g1") });

    expect(JSON.parse(first.out)).toEqual({ followup_message: EXPECTED_REASON });
    expect((await run(["hook", "stop", "--agent", "cursor"], { stdin: event(1, "g2") })).out).toBe("");
  });

  it("Cursor молчит, если ход прерван, и если событие без каталога", async () => {
    const { run, repo } = await changedTaskSandbox();
    const aborted = JSON.stringify({ conversation_id: "c", generation_id: "g1", workspace_roots: [repo], status: "aborted", loop_count: 0 });

    expect(await run(["hook", "stop", "--agent", "cursor"], { stdin: aborted })).toMatchObject({ code: EXIT.ok, out: "" });
    expect(await run(["hook", "stop", "--agent", "cursor"], { stdin: JSON.stringify({ conversation_id: "c" }) })).toMatchObject({ code: EXIT.ok, out: "", err: "" });
  });

  it("плагин и ручной хук в одном ходе: отвечает только один", async () => {
    const { run, repo } = await changedTaskSandbox();
    const event = JSON.stringify({ session_id: "s", cwd: repo, hook_event_name: "Stop", stop_hook_active: false, last_assistant_message: "Готово." });

    const [a, b] = await Promise.all([run(["hook", "stop"], { stdin: event }), run(["hook", "stop"], { stdin: event })]);

    expect([a.out, b.out].filter((out) => out !== "")).toHaveLength(1);
    expect([a.code, b.code]).toEqual([EXIT.ok, EXIT.ok]);
  });

  it("неизвестный агент — ошибка использования с именем агента", async () => {
    const { run } = await makeCliSandbox();

    const result = await run(["hook", "stop", "--agent", "gemini"], { stdin: "{}" });

    expect(result.code).toBe(EXIT.invalid);
    expect(result.err).toContain("gemini");
  });
});
