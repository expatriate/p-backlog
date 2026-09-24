import { appendFile, chmod, readFile, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { makeTempDir, writeFiles } from "../store/testing/temp-dirs";
import { listTranscripts, scanTranscripts, type TranscriptFile } from "./transcripts";
import { emptyUsageCache, readUsageCache, writeUsageCache } from "./usage-cache";

const CWD = "/Users/x/projects/spa";
const BIG_BUDGET = 10_000_000;
const NOW = new Date("2026-09-19T12:00:00Z");

function usage(input: number, output: number) {
  return { input_tokens: input, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
}

function assistantLine(timestamp: string, model: string, tokens: { input: number; output: number }, content: unknown[] = []) {
  return { type: "assistant", timestamp, cwd: CWD, message: { model, usage: usage(tokens.input, tokens.output), content } };
}

function hookFeedbackLine(timestamp: string) {
  return { type: "user", isMeta: true, timestamp, cwd: CWD, message: { content: "Stop hook feedback:\nБеклог p-backlog: тест" } };
}

function bashToolUse(id: string, command: string) {
  return { type: "tool_use", id, name: "Bash", input: { command } };
}

function toolResultLine(timestamp: string, toolUseId: string, text: string) {
  return { type: "user", timestamp, cwd: CWD, message: { content: [{ type: "tool_result", tool_use_id: toolUseId, content: text }] } };
}

function jsonl(lines: unknown[]): string {
  return lines.map((line) => JSON.stringify(line)).join("\n") + "\n";
}

function totalTokens(files: Awaited<ReturnType<typeof scanTranscripts>>["cache"]["files"]): number {
  return Object.values(files).reduce((sum, file) => sum + file.buckets.reduce((bucketSum, bucket) => bucketSum + bucket.tokens.input + bucket.tokens.output + bucket.tokens.cacheWrite5m, 0), 0);
}

async function transcriptFile(path: string, text: string): Promise<TranscriptFile> {
  await writeFile(path, text, "utf8");
  return listed(path);
}

async function listed(path: string): Promise<TranscriptFile> {
  const { size, mtimeMs } = await stat(path);
  return { path, size, mtimeMs };
}

async function unreadable(path: string): Promise<void> {
  await chmod(path, 0o000);
  onTestFinished(() => chmod(path, 0o600));
}

describe("список расшифровок", () => {
  it("находит файлы сессий и подагентов, включая вложенные подагенты workflow", async () => {
    const root = await makeTempDir();
    await writeFiles(root, {
      "proj1/session1.jsonl": jsonl([assistantLine("2026-09-19T09:00:00.000Z", "claude-sonnet-5", { input: 1, output: 1 })]),
      "proj1/session2/subagents/agent-a.jsonl": jsonl([assistantLine("2026-09-19T09:00:00.000Z", "claude-sonnet-5", { input: 1, output: 1 })]),
      "proj1/session2/subagents/workflows/wf_1/agent-b.jsonl": jsonl([assistantLine("2026-09-19T09:00:00.000Z", "claude-sonnet-5", { input: 1, output: 1 })]),
      "proj1/session2/other.txt": "не расшифровка",
    });

    const files = await listTranscripts(root);

    expect(files.map((file) => file.path).sort()).toEqual(
      [join(root, "proj1/session1.jsonl"), join(root, "proj1/session2/subagents/agent-a.jsonl"), join(root, "proj1/session2/subagents/workflows/wf_1/agent-b.jsonl")].sort(),
    );
  });

  it("нет каталога расшифровок — пустой список", async () => {
    const root = await makeTempDir();

    expect(await listTranscripts(join(root, "does-not-exist"))).toEqual([]);
  });
});

describe("чтение расшифровок по частям", () => {
  it("второй проход дочитывает только новую строку, вклад не удваивается", async () => {
    const root = await makeTempDir();
    const path = join(root, "session.jsonl");
    const first = await transcriptFile(path, jsonl([hookFeedbackLine("2026-09-19T08:59:00.000Z"), assistantLine("2026-09-19T09:00:00.000Z", "claude-sonnet-5", { input: 100, output: 20 })]));

    const pass1 = await scanTranscripts({ files: [first], cache: emptyUsageCache(), byteBudget: BIG_BUDGET, now: NOW });
    expect(totalTokens(pass1.cache.files)).toBe(120);
    expect(pass1.filesDone).toBe(1);
    expect(pass1.bytesLeft).toBe(0);

    await appendFile(path, jsonl([assistantLine("2026-09-19T09:05:00.000Z", "claude-sonnet-5", { input: 50, output: 10 })]));
    const second = await listed(path);

    const pass2 = await scanTranscripts({ files: [second], cache: pass1.cache, byteBudget: BIG_BUDGET, now: NOW });

    expect(totalTokens(pass2.cache.files)).toBe(180);
    expect(pass2.filesDone).toBe(1);
    expect(pass2.bytesLeft).toBe(0);
  });

  it("незаконченная последняя строка ждёт следующего прохода", async () => {
    const root = await makeTempDir();
    const path = join(root, "session.jsonl");
    const complete = jsonl([hookFeedbackLine("2026-09-19T08:59:00.000Z"), assistantLine("2026-09-19T09:00:00.000Z", "claude-sonnet-5", { input: 100, output: 20 })]);
    const incompleteTail = JSON.stringify(assistantLine("2026-09-19T09:05:00.000Z", "claude-sonnet-5", { input: 999, output: 999 })).slice(0, -5);
    const file = await transcriptFile(path, complete + incompleteTail);

    const pass1 = await scanTranscripts({ files: [file], cache: emptyUsageCache(), byteBudget: BIG_BUDGET, now: NOW });

    expect(totalTokens(pass1.cache.files)).toBe(120);
    expect(pass1.filesDone).toBe(0);
    expect(pass1.bytesLeft).toBe(Buffer.byteLength(incompleteTail, "utf8"));

    const finishedLine = JSON.stringify(assistantLine("2026-09-19T09:05:00.000Z", "claude-sonnet-5", { input: 5, output: 5 }));
    await writeFile(path, complete + finishedLine + "\n", "utf8");
    const finished = await listed(path);

    const pass2 = await scanTranscripts({ files: [finished], cache: pass1.cache, byteBudget: BIG_BUDGET, now: NOW });

    expect(totalTokens(pass2.cache.files)).toBe(130);
    expect(pass2.filesDone).toBe(1);
    expect(pass2.bytesLeft).toBe(0);
  });

  it("давно не менявшийся файл без перевода строки в конце дочитывается: хвост разбирается как последняя строка", async () => {
    const root = await makeTempDir();
    const path = join(root, "session.jsonl");
    const complete = jsonl([hookFeedbackLine("2026-09-19T08:59:00.000Z"), assistantLine("2026-09-19T09:00:00.000Z", "claude-sonnet-5", { input: 100, output: 20 })]);
    const tailWithoutNewline = JSON.stringify(assistantLine("2026-09-19T09:05:00.000Z", "claude-sonnet-5", { input: 5, output: 5 }));
    await writeFile(path, complete + tailWithoutNewline, "utf8");
    const writtenAt = new Date("2026-09-19T09:05:00Z");
    await utimes(path, writtenAt, writtenAt);
    const file = await listed(path);

    const whileWriting = await scanTranscripts({ files: [file], cache: emptyUsageCache(), byteBudget: BIG_BUDGET, now: new Date("2026-09-19T09:06:00Z") });
    const longAfter = await scanTranscripts({ files: [file], cache: whileWriting.cache, byteBudget: BIG_BUDGET, now: new Date("2026-09-19T12:00:00Z") });

    expect(whileWriting).toMatchObject({ filesDone: 0, bytesLeft: Buffer.byteLength(tailWithoutNewline, "utf8") });
    expect(longAfter).toMatchObject({ filesDone: 1, bytesLeft: 0 });
    expect(totalTokens(longAfter.cache.files)).toBe(130);
  });

  it("файл стал меньше — читается заново с нуля, старый вклад не остаётся", async () => {
    const root = await makeTempDir();
    const path = join(root, "session.jsonl");
    const original = await transcriptFile(
      path,
      jsonl([hookFeedbackLine("2026-09-19T08:59:00.000Z"), assistantLine("2026-09-19T09:00:00.000Z", "claude-sonnet-5", { input: 100, output: 20 }), assistantLine("2026-09-19T09:01:00.000Z", "claude-sonnet-5", { input: 100, output: 20 })]),
    );
    const pass1 = await scanTranscripts({ files: [original], cache: emptyUsageCache(), byteBudget: BIG_BUDGET, now: NOW });
    expect(totalTokens(pass1.cache.files)).toBe(240);

    const rewritten = await transcriptFile(path, jsonl([hookFeedbackLine("2026-09-19T09:59:00.000Z"), assistantLine("2026-09-19T10:00:00.000Z", "claude-opus-5", { input: 7, output: 3 })]));

    const pass2 = await scanTranscripts({ files: [rewritten], cache: pass1.cache, byteBudget: BIG_BUDGET, now: NOW });

    expect(totalTokens(pass2.cache.files)).toBe(10);
    expect(pass2.filesDone).toBe(1);
  });

  it("бюджет байт за проход ограничивает чтение, следующий проход добирает остальное", async () => {
    const root = await makeTempDir();
    const path = join(root, "session.jsonl");
    const replies = Array.from({ length: 5 }, (_, index) => assistantLine(`2026-09-19T09:0${index}:00.000Z`, "claude-sonnet-5", { input: 100, output: 0 }));
    const allLines = [hookFeedbackLine("2026-09-19T08:59:00.000Z"), ...replies];
    const serializedLines = allLines.map((line) => `${JSON.stringify(line)}\n`);
    const budgetForFirstReplyOnly = serializedLines.slice(0, 2).reduce((sum, line) => sum + Buffer.byteLength(line, "utf8"), 0);
    const file = await transcriptFile(path, serializedLines.join(""));

    const pass1 = await scanTranscripts({ files: [file], cache: emptyUsageCache(), byteBudget: budgetForFirstReplyOnly, now: NOW });

    expect(pass1.filesDone).toBe(0);
    expect(pass1.bytesLeft).toBeGreaterThan(0);
    expect(totalTokens(pass1.cache.files)).toBe(100);

    const stillFile = await listed(path);
    const pass2 = await scanTranscripts({ files: [stillFile], cache: pass1.cache, byteBudget: BIG_BUDGET, now: NOW });

    expect(pass2.filesDone).toBe(1);
    expect(pass2.bytesLeft).toBe(0);
    expect(totalTokens(pass2.cache.files)).toBe(500);
  });

  it("вывод backlog в конце расшифровки без следующего ответа учитывается по последней модели", async () => {
    const root = await makeTempDir();
    const lines = [
      assistantLine("2026-09-19T09:00:00.000Z", "claude-opus-5", { input: 1, output: 1 }, [bashToolUse("toolu_1", "backlog list")]),
      toolResultLine("2026-09-19T09:00:01.000Z", "toolu_1", "x".repeat(30)),
    ];
    const file = await transcriptFile(join(root, "session.jsonl"), jsonl(lines));

    const { cache } = await scanTranscripts({ files: [file], cache: emptyUsageCache(), byteBudget: BIG_BUDGET, now: NOW });

    expect(Object.values(cache.files)[0]?.buckets).toContainEqual(expect.objectContaining({ kind: "cli", model: "claude-opus-5", tokens: expect.objectContaining({ cacheWrite5m: 10 }) }));
  });

  it("строка длиннее лимита прохода пропускается, следующие строки читаются", async () => {
    const root = await makeTempDir();
    const giant = JSON.stringify({ type: "user", message: { content: "x".repeat(500) } });
    const text = `${giant}\n${jsonl([assistantLine("2026-09-19T09:00:00.000Z", "claude-sonnet-5", { input: 7, output: 3 })])}`;
    const file = await transcriptFile(join(root, "session.jsonl"), text);

    let cache = emptyUsageCache();
    for (let pass = 0; pass < 10; pass++) cache = (await scanTranscripts({ files: [file], cache, byteBudget: 200, now: NOW })).cache;

    expect(Object.values(cache.files)[0]?.offset).toBe(file.size);
  });

  it("файл перезаписан с тем же размером — читается заново, старый вклад не остаётся", async () => {
    const root = await makeTempDir();
    const path = join(root, "session.jsonl");
    const original = await transcriptFile(path, jsonl([hookFeedbackLine("2026-09-19T08:59:00.000Z"), assistantLine("2026-09-19T09:00:00.000Z", "claude-opus-5", { input: 100, output: 20 })]));
    const pass1 = await scanTranscripts({ files: [original], cache: emptyUsageCache(), byteBudget: BIG_BUDGET, now: NOW });

    await writeFile(path, jsonl([hookFeedbackLine("2026-09-19T08:59:00.000Z"), assistantLine("2026-09-19T09:00:00.000Z", "claude-opus-5", { input: 300, output: 40 })]), "utf8");
    await utimes(path, new Date(), new Date(original.mtimeMs + 1000));
    const sameSize = await listed(path);
    expect(sameSize.size).toBe(original.size);
    const pass2 = await scanTranscripts({ files: [sameSize], cache: pass1.cache, byteBudget: BIG_BUDGET, now: NOW });

    expect(totalTokens(pass2.cache.files)).toBe(340);
  });

  it("файл, до которого не дошёл бюджет прохода, не открывается", async () => {
    const root = await makeTempDir();
    const path = join(root, "session.jsonl");
    const file = await transcriptFile(path, jsonl([assistantLine("2026-09-19T09:00:00.000Z", "claude-sonnet-5", { input: 100, output: 20 })]));
    await unreadable(path);

    const pass = await scanTranscripts({ files: [file], cache: emptyUsageCache(), byteBudget: 0, now: NOW });

    expect(pass).toMatchObject({ bytesRead: 0, bytesLeft: file.size, filesDone: 0 });
  });

  it("дочитанный неизменный файл не открывается на следующих проходах, вклад сохраняется", async () => {
    const root = await makeTempDir();
    const path = join(root, "session.jsonl");
    const file = await transcriptFile(path, jsonl([hookFeedbackLine("2026-09-19T08:59:00.000Z"), assistantLine("2026-09-19T09:00:00.000Z", "claude-sonnet-5", { input: 100, output: 20 })]));
    const pass1 = await scanTranscripts({ files: [file], cache: emptyUsageCache(), byteBudget: BIG_BUDGET, now: NOW });
    await unreadable(path);

    const pass2 = await scanTranscripts({ files: [await listed(path)], cache: pass1.cache, byteBudget: BIG_BUDGET, now: NOW });

    expect(totalTokens(pass2.cache.files)).toBe(120);
    expect(pass2.filesDone).toBe(1);
  });

  it("удалённая расшифровка сохраняет вклад, пока он попадает в окно отчёта о расходах", async () => {
    const root = await makeTempDir();
    const file = await transcriptFile(join(root, "session.jsonl"), jsonl([hookFeedbackLine("2026-09-19T08:59:00.000Z"), assistantLine("2026-09-19T09:00:00.000Z", "claude-sonnet-5", { input: 100, output: 20 })]));
    const pass1 = await scanTranscripts({ files: [file], cache: emptyUsageCache(), byteBudget: BIG_BUDGET, now: new Date("2026-09-19T12:00:00Z") });

    const soonAfter = await scanTranscripts({ files: [], cache: pass1.cache, byteBudget: BIG_BUDGET, now: new Date("2026-10-10T12:00:00Z") });
    const monthsAfter = await scanTranscripts({ files: [], cache: soonAfter.cache, byteBudget: BIG_BUDGET, now: new Date("2026-11-19T12:00:00Z") });

    expect(totalTokens(soonAfter.cache.files)).toBe(120);
    expect(soonAfter).toMatchObject({ filesDone: 0, bytesLeft: 0 });
    expect(monthsAfter.cache.files).toEqual({});
  });

  it("кэш на диске после записи читается обратно", async () => {
    const root = await makeTempDir();
    const path = join(root, "session.jsonl");
    const file = await transcriptFile(path, jsonl([assistantLine("2026-09-19T09:00:00.000Z", "claude-sonnet-5", { input: 100, output: 20 })]));
    const { cache } = await scanTranscripts({ files: [file], cache: emptyUsageCache(), byteBudget: BIG_BUDGET, now: NOW });

    await writeUsageCache(root, cache);
    const reloaded = await readUsageCache(root);

    expect(reloaded).toEqual(cache);
  });

  it("тексты из расшифровок не попадают в файл кэша", async () => {
    const root = await makeTempDir();
    const path = join(root, "session.jsonl");
    const marker = `MARKER-${"x".repeat(40)}`;
    const lines = [
      assistantLine("2026-09-19T09:00:00.000Z", "claude-sonnet-5", { input: 5, output: 5 }, [bashToolUse("toolu_1", "backlog list")]),
      toolResultLine("2026-09-19T09:00:01.000Z", "toolu_1", marker),
      assistantLine("2026-09-19T09:00:02.000Z", "claude-opus-5", { input: 1, output: 1 }),
    ];
    const file = await transcriptFile(path, jsonl(lines));
    const { cache } = await scanTranscripts({ files: [file], cache: emptyUsageCache(), byteBudget: BIG_BUDGET, now: NOW });

    await writeUsageCache(root, cache);
    const raw = await readFile(join(root, ".usage-cache.json"), "utf8");

    expect(raw).not.toContain(marker);
    expect(raw).not.toContain("MARKER-");
  });
});
