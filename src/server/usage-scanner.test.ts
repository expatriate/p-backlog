import { appendFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { newTranscriptState } from "../core/stats/cost/attribute";
import { costReport } from "../core/stats/cost/cost-report";
import { makeTempDir, writeFiles } from "../core/store/testing/temp-dirs";
import { failOnPathError } from "../core/store/testing/path-errors";
import { emptyUsageCache, readUsageCache, usageBucketsOf, writeUsageCache } from "../core/usage/usage-cache";
import { localizedWarn } from "./messages";
import { CATCH_UP_DELAY_MS, createUsageScanner, type UsageScannerOptions } from "./usage-scanner";
import { DAY_MS } from "../core/model/dates";

function scannerOf(options: Omit<UsageScannerOptions, "warn">, warn: (line: string) => void = () => undefined) {
  return createUsageScanner({ ...options, warn: localizedWarn(async () => "ru", warn) });
}

describe("createUsageScanner", () => {
  it("до первого прохода список расшифровок ещё не получен", async () => {
    const root = await makeTempDir();
    const scanner = scannerOf({ root, claudeProjectsDir: join(root, "does-not-exist") });

    expect(scanner.snapshot()).toEqual({ cache: emptyUsageCache(), scan: { listed: false, filesTotal: 0, filesDone: 0, bytesLeft: 0 }, revision: 0 });
  });

  it("нет каталога расшифровок — после прохода список получен и пуст", async () => {
    const root = await makeTempDir();
    const scanner = scannerOf({ root, claudeProjectsDir: join(root, "does-not-exist") });

    await scanner.scanOnce();

    expect(scanner.snapshot().scan).toEqual({ listed: true, filesTotal: 0, filesDone: 0, bytesLeft: 0 });
  });

  it("после смены модели Codex показывает разные цены и не считает весь диалог или повтор счётчика", async () => {
    const root = await makeTempDir();
    const codexHome = join(root, ".codex");
    const sessionPath = "sessions/2026/09/19/rollout-demo.jsonl";
    const timestamp = "2026-09-19T09:00:00.000Z";
    const cwd = join(root, "repo");
    const now = () => new Date(timestamp);
    const event = (type: string, payload: object) => JSON.stringify({ timestamp, type, payload }) + "\n";
    const total = (input_tokens: number, cached_input_tokens: number, output_tokens: number) =>
      event("event_msg", { type: "token_count", info: { total_token_usage: { input_tokens, cached_input_tokens, output_tokens } } });
    const input = (text: string) => event("response_item", { type: "message", role: "user", content: [{ type: "input_text", text }] });
    const options = { root, claudeProjectsDir: join(root, ".claude", "projects"), codexHome, now };
    await writeFiles(codexHome, {
      [sessionPath]:
        event("session_meta", { originator: "Codex Desktop", history_mode: "legacy", cwd }) +
        event("turn_context", { model: "gpt-6.2-sol", cwd }) +
        total(100, 0, 10) +
        input('<hook_prompt hook_run_id="stop:1">Беклог проект: перепроверь задачу</hook_prompt>'),
    });
    await scannerOf(options).scanOnce();

    await appendFile(
      join(codexHome, sessionPath),
      total(120, 8, 13) +
        total(120, 8, 13) +
        event("turn_context", { model: "gpt-6-luna", cwd }) +
        input("Беклог проект: покажи список задач") +
        total(200, 8, 20) +
        event("response_item", { type: "function_call", name: "exec_command", call_id: "cli", arguments: JSON.stringify({ cmd: "backlog list", workdir: "other" }) }) +
        event("response_item", { type: "function_call_output", call_id: "cli", output: "abcdef" }) +
        event("response_item", { type: "custom_tool_call", name: "exec", call_id: "app", input: 'text(await tools.exec_command({cmd: "backlog show SPA-1"}));' }) +
        event("response_item", {
          type: "custom_tool_call_output",
          call_id: "app",
          output: [
            { type: "input_text", text: "abcdef" },
            { type: "input_image", image_url: "data:image/png;base64,AA==" },
          ],
        }) +
        event("response_item", {
          type: "custom_tool_call",
          name: "exec",
          call_id: "mixed",
          input: 'text(await tools.exec_command({cmd: "backlog list"})); text(await tools.exec_command({cmd: "git status"}));',
        }) +
        event("response_item", { type: "custom_tool_call_output", call_id: "mixed", output: "backlog result and a long git status" }) +
        event("response_item", { type: "function_call", name: "exec_command", call_id: "mixed-shell", arguments: JSON.stringify({ cmd: "git status && backlog list" }) }) +
        event("response_item", { type: "function_call_output", call_id: "mixed-shell", output: "backlog result and a long git status" }) +
        event("response_item", { type: "function_call", name: "exec_command", call_id: "mixed-skill", arguments: JSON.stringify({ cmd: "cat ~/skills/backlog/SKILL.md && git diff" }) }) +
        event("response_item", { type: "function_call_output", call_id: "mixed-skill", output: "skill and a long diff" }),
    );
    const scanner = scannerOf(options);
    await scanner.scanOnce();
    await scanner.scanOnce();

    const { cache, scan } = scanner.snapshot();
    expect(
      usageBucketsOf(cache)
        .filter((bucket) => bucket.kind === "cli")
        .map((bucket) => bucket.cwd)
        .sort(),
    ).toEqual([cwd, join(cwd, "other")]);
    const report = costReport({ buckets: usageBucketsOf(cache), runs: [], projectOf: () => "spa", projectId: "spa", now: now(), scan });
    expect(report.totals).toMatchObject({ hookTokens: 23, hookTurns: 1, cliTokens: 4, hasUnpricedTokens: false });
    expect(report.models.map(({ model, tokens }) => [model, tokens])).toEqual([
      ["gpt-6.2-sol", 23],
      ["gpt-6-luna", 4],
    ]);
    expect(report.models[0]?.cost).toBeCloseTo(0.0000548, 10);
    expect(report.models[1]?.cost).toBeCloseTo(0.0000004, 10);
  });

  it("в Codex Desktop считает вывод каждой команды один раз в проекте её рабочего каталога", async () => {
    const root = await makeTempDir();
    const codexHome = join(root, ".codex");
    const sessionPath = "sessions/2026/09/19/rollout-desktop.jsonl";
    const timestamp = "2026-09-19T09:00:00.000Z";
    const now = () => new Date(timestamp);
    const spa = join(root, "spa");
    const web = join(root, "web repo");
    const event = (type: string, payload: object) => JSON.stringify({ timestamp, type, payload }) + "\n";
    const toolCall = (id: string, input: string) => event("response_item", { type: "custom_tool_call", name: "exec", call_id: id, input });
    const toolOutput = (id: string, output: string) => event("response_item", { type: "custom_tool_call_output", call_id: id, output });
    const commandOutput = (id: string, script: string, cwd: string, output: string) =>
      event("event_msg", {
        type: "item_completed",
        item: { type: "CommandExecution", id, source: "unified_exec_startup", cwd: pathToFileURL(cwd).href, command: ["/bin/zsh", "-lc", script], aggregated_output: output },
      });
    const spaOutput = "a".repeat(90);
    const webOutput = "b".repeat(150);
    const gitOutput = "g".repeat(300);
    const options = { root, claudeProjectsDir: join(root, "no-claude"), codexHome, now };
    await writeFiles(codexHome, {
      [sessionPath]:
        event("session_meta", { originator: "Codex Desktop", history_mode: "paginated", cwd: spa }) +
        event("turn_context", { model: "gpt-6.2-sol", cwd: spa }) +
        toolCall("mixed", 'await Promise.all([tools.exec_command({cmd: "backlog list"}), tools.exec_command({cmd: "git status"})]);') +
        commandOutput("exec-mixed-backlog", "backlog list", web, webOutput) +
        commandOutput("exec-mixed-git", "git status", spa, gitOutput) +
        toolOutput("mixed", webOutput + gitOutput) +
        toolCall("pure", 'text((await tools.exec_command({cmd: "backlog stats"})).output);') +
        toolOutput("pure", spaOutput),
    });
    await scannerOf(options).scanOnce();
    await appendFile(join(codexHome, sessionPath), commandOutput("exec-pure-backlog", "backlog stats", spa, spaOutput));

    const scanner = scannerOf(options);
    await scanner.scanOnce();
    await scanner.scanOnce();

    const { cache, scan } = scanner.snapshot();
    const buckets = usageBucketsOf(cache);
    const projects = new Map([
      [spa, "spa"],
      [web, "web"],
    ]);
    const projectOf = (cwd: string) => projects.get(cwd) ?? null;
    const report = (projectId?: string) => costReport({ buckets, runs: [], projectOf, projectId, now: now(), scan }).totals;
    expect(report()).toMatchObject({ cliTokens: 80, cost: expect.closeTo(0.00016, 10) });
    expect(report("spa")).toMatchObject({ cliTokens: 30, cost: expect.closeTo(0.00006, 10) });
    expect(report("web")).toMatchObject({ cliTokens: 50, cost: expect.closeTo(0.0001, 10) });
  });

  it("недоступный каталог сессий Codex не прерывает чтение архива и сессий Claude Code", async () => {
    const root = await makeTempDir();
    const claudeProjectsDir = join(root, ".claude", "projects");
    const codexHome = join(root, ".codex");
    const timestamp = "2026-09-19T09:00:00Z";
    const now = () => new Date(timestamp);
    const hook = { type: "user", isMeta: true, timestamp, cwd: root, message: { content: "Stop hook feedback:\nБеклог spa: перепроверь задачу" } };
    const assistant = { type: "assistant", timestamp, cwd: root, message: { model: "claude-opus-5", usage: { input_tokens: 100, output_tokens: 20 } } };
    const archive = [
      { type: "turn_context", timestamp, payload: { cwd: root, model: "gpt-6.2-sol" } },
      { type: "response_item", timestamp, payload: { type: "message", role: "user", content: [{ type: "input_text", text: '<hook_prompt hook_run_id="stop:1">Беклог spa: перепроверь задачу</hook_prompt>' }] } },
      { type: "event_msg", timestamp, payload: { type: "token_count", info: { total_token_usage: { input_tokens: 50, output_tokens: 10 } } } },
    ];
    await writeFiles(codexHome, { sessions: "not a directory", "archived_sessions/rollout-demo.jsonl": archive.map((line) => JSON.stringify(line) + "\n").join("") });
    await writeFiles(claudeProjectsDir, { "proj/run.jsonl": [hook, assistant].map((line) => JSON.stringify(line) + "\n").join("") });
    const warn = vi.fn();
    const scanner = scannerOf({ root, claudeProjectsDir, codexHome, now }, warn);

    await scanner.scanOnce();

    expect(usageBucketsOf(scanner.snapshot().cache)).toContainEqual(expect.objectContaining({ model: "claude-opus-5", tokens: expect.objectContaining({ input: 100, output: 20 }) }));
    expect(usageBucketsOf(scanner.snapshot().cache)).toContainEqual(expect.objectContaining({ model: "gpt-6.2-sol", tokens: expect.objectContaining({ input: 50, output: 10 }) }));
    expect(warn).toHaveBeenCalledOnce();
  });

  it("повторный вызов scanOnce во время прохода ждёт текущий, а не запускает второй", async () => {
    const root = await makeTempDir();
    const scanner = scannerOf({ root, claudeProjectsDir: join(root, "does-not-exist") });

    const first = scanner.scanOnce();
    const second = scanner.scanOnce();

    expect(second).toBe(first);
    await first;
  });

  it("stop дожидается уже начатого прохода — к моменту, когда он разрешится, кеш уже записан", async () => {
    const root = await makeTempDir();
    const transcriptsDir = await makeTempDir();
    const line = JSON.stringify({ type: "assistant", timestamp: "2026-09-19T09:00:00.000Z", cwd: "/x", message: { model: "claude-opus-5", usage: { input_tokens: 1, output_tokens: 1 } } });
    await writeFiles(transcriptsDir, { "proj/a.jsonl": `${line}\n` });
    const scanner = scannerOf({ root, claudeProjectsDir: transcriptsDir });

    void scanner.scanOnce();
    await scanner.stop();

    const cache = await readUsageCache(root);
    expect(Object.keys(cache.files)).toContain(join(transcriptsDir, "proj/a.jsonl"));
  });

  it("проход с исчерпанным лимитом байт оставляет остаток, следующие дочитывают до конца", async () => {
    const root = await makeTempDir();
    const transcriptsDir = await makeTempDir();
    const line = JSON.stringify({ type: "assistant", timestamp: "2026-09-19T09:00:00.000Z", cwd: "/x", message: { model: "claude-opus-5", usage: { input_tokens: 1, output_tokens: 1 } } });
    await writeFiles(transcriptsDir, { "proj/a.jsonl": `${line}\n`, "proj/b.jsonl": `${line}\n` });
    const scanner = scannerOf({ root, claudeProjectsDir: transcriptsDir, byteBudget: line.length + 1 });

    await scanner.scanOnce();
    expect(scanner.snapshot().scan).toMatchObject({ filesTotal: 2, filesDone: 1, bytesLeft: line.length + 1 });

    await scanner.scanOnce();
    expect(scanner.snapshot().scan).toMatchObject({ filesDone: 2, bytesLeft: 0 });
  });

  it("revision растёт после прохода с новыми данными и не растёт после прохода без изменений", async () => {
    const root = await makeTempDir();
    const transcriptsDir = await makeTempDir();
    const line = JSON.stringify({ type: "assistant", timestamp: "2026-09-19T09:00:00.000Z", cwd: "/x", message: { model: "claude-opus-5", usage: { input_tokens: 1, output_tokens: 1 } } });
    await writeFiles(transcriptsDir, { "proj/a.jsonl": `${line}\n` });
    const scanner = scannerOf({ root, claudeProjectsDir: transcriptsDir });
    const before = scanner.snapshot().revision;

    await scanner.scanOnce();
    const afterFirstPass = scanner.snapshot().revision;
    expect(afterFirstPass).toBeGreaterThan(before);

    await scanner.scanOnce();
    expect(scanner.snapshot().revision).toBe(afterFirstPass);
  });

  it("revision растёт, когда вклад удалённой расшифровки выпадает из окна истории, хотя новых байт не было", async () => {
    const root = await makeTempDir();
    const transcriptsDir = await makeTempDir();
    const filePath = join(transcriptsDir, "proj", "a.jsonl");
    const hookLine = JSON.stringify({ type: "user", isMeta: true, timestamp: "2026-09-19T08:59:00.000Z", cwd: "/x", message: { content: "Stop hook feedback:\nБеклог p-backlog: тест" } });
    const assistantLine = JSON.stringify({ type: "assistant", timestamp: "2026-09-19T09:00:00.000Z", cwd: "/x", message: { model: "claude-opus-5", usage: { input_tokens: 1, output_tokens: 1 } } });
    await writeFiles(transcriptsDir, { "proj/a.jsonl": `${hookLine}\n${assistantLine}\n` });
    let now = new Date("2026-09-19T12:00:00Z");
    const scanner = scannerOf({ root, claudeProjectsDir: transcriptsDir, now: () => now });
    await scanner.scanOnce();

    await rm(filePath);
    now = new Date("2026-10-10T12:00:00Z");
    await scanner.scanOnce();
    const stillWithinWindow = scanner.snapshot().revision;
    expect(Object.keys(scanner.snapshot().cache.files)).toContain(filePath);

    now = new Date("2026-12-18T12:00:00Z");
    await scanner.scanOnce();

    expect(scanner.snapshot().revision).toBeGreaterThan(stillWithinWindow);
    expect(scanner.snapshot().cache.files).toEqual({});
  });

  it("обрезанный кэш сохраняется без новых байтов", async () => {
    const root = await makeTempDir();
    const transcriptsDir = await makeTempDir();
    const path = join(transcriptsDir, "proj", "a.jsonl");
    const line = JSON.stringify({ type: "assistant", timestamp: "2026-09-19T09:00:00.000Z", cwd: "/x", message: { model: "claude-opus-5", usage: { input_tokens: 1, output_tokens: 1 } } });
    await writeFiles(transcriptsDir, { "proj/a.jsonl": `${line}\n` });
    const { size, mtimeMs } = await stat(path);
    const now = new Date("2026-09-19T12:00:00Z");
    const staleBucket = {
      slot: new Date(now.getTime() - 100 * DAY_MS).toISOString(),
      cwd: "/x",
      model: "claude-opus-5",
      kind: "hook" as const,
      tokens: { input: 1, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0 },
      hookTurns: 0,
    };
    await writeUsageCache(
      root,
      {
        ...emptyUsageCache(),
        files: { [path]: { size, mtimeMs, offset: size, fingerprint: "unchanged", state: newTranscriptState(), buckets: [staleBucket] } },
      },
      failOnPathError,
    );
    const scanner = scannerOf({ root, claudeProjectsDir: transcriptsDir, now: () => now });

    await scanner.scanOnce();

    const cache = await readUsageCache(root);
    expect(cache.files[path]?.buckets).toEqual([]);
  });

  it("упавший проход не оставляет сканер в догоняющем режиме", async () => {
    const root = await makeTempDir();
    const transcriptsDir = await makeTempDir();
    const line = JSON.stringify({ type: "assistant", timestamp: "2026-09-19T09:00:00.000Z", cwd: "/x", message: { model: "claude-opus-5", usage: { input_tokens: 1, output_tokens: 1 } } });
    await writeFiles(transcriptsDir, { "proj/a.jsonl": `${line}\n`, "proj/b.jsonl": `${line}\n` });
    const failures: string[] = [];
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const schedule = vi.spyOn(globalThis, "setTimeout");
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const delays = () => schedule.mock.calls.map(([, delay]) => delay);
    const scanner = scannerOf({ root, claudeProjectsDir: transcriptsDir, byteBudget: line.length + 1, intervalMs: 60_000 }, (failure) => failures.push(failure));

    scanner.start();
    await scanner.scanOnce();

    expect(delays().at(-1)).toBe(CATCH_UP_DELAY_MS);

    await rm(root, { recursive: true });
    await writeFile(root, "");
    await vi.advanceTimersByTimeAsync(CATCH_UP_DELAY_MS);
    await scanner.scanOnce();
    await scanner.stop();

    expect(failures).toHaveLength(1);
    expect(delays().at(-1)).toBe(60_000);
  });
});
