import { describe, expect, it } from "vitest";
import { formatLocalIso } from "../../model/dates";
import { attributeLine, newTranscriptState } from "./attribute";

const CWD = "/Users/x/projects/spa";
const PROJECT_OF = (cwd: string): string | null => (cwd.includes("spa") ? "SPA" : null);

function assistantLine(timestamp: string, model: string, usage: Record<string, unknown> | null, content: unknown[] = []) {
  return { type: "assistant", timestamp, cwd: CWD, isSidechain: false, message: { model, ...(usage ? { usage } : {}), content } };
}

function usage(inputTokens: number, outputTokens: number) {
  return { input_tokens: inputTokens, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: outputTokens, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 }, speed: "standard" };
}

function hookFeedbackLine(timestamp: string) {
  return { type: "user", isMeta: true, timestamp, cwd: CWD, message: { role: "user", content: "Stop hook feedback:\nБеклог p-backlog: после последней проверки менялся код задач — PB-1" } };
}

function realUserLine(timestamp: string, text = "влей в master") {
  return { type: "user", timestamp, cwd: CWD, message: { role: "user", content: text } };
}

function toolResultLine(timestamp: string, toolUseId: string, text: string) {
  return { type: "user", timestamp, cwd: CWD, message: { role: "user", content: [{ type: "tool_result", tool_use_id: toolUseId, content: text }] } };
}

function bashToolUse(id: string, command: string) {
  return { type: "tool_use", id, name: "Bash", input: { command } };
}

function skillBodyLine(timestamp: string) {
  const text = "Base directory for this skill: /Users/x/.claude/skills/backlog\nБаза для работы с беклогом.";
  return { type: "user", isMeta: true, timestamp, cwd: CWD, message: { role: "user", content: text } };
}

describe("отнесение строк расшифровки к накладным расходам беклога", () => {
  it("ход хука открывается сообщением Stop hook feedback, оба ответа модели внутри — kind hook, ходов — один", () => {
    const state = newTranscriptState();

    const opened = attributeLine(hookFeedbackLine("2026-09-19T09:00:00.000Z"), state, PROJECT_OF);
    const first = attributeLine(assistantLine("2026-09-19T09:00:01.000Z", "claude-opus-5", usage(100, 20)), state, PROJECT_OF);
    const second = attributeLine(assistantLine("2026-09-19T09:00:02.000Z", "claude-opus-5", usage(50, 10)), state, PROJECT_OF);

    const buckets = [...opened, ...first, ...second];
    expect(buckets.every((bucket) => bucket.kind === "hook")).toBe(true);
    expect(buckets.reduce((sum, bucket) => sum + bucket.hookTurns, 0)).toBe(1);
    expect(first[0]?.tokens).toMatchObject({ input: 100, output: 20 });
  });

  it("до первого ответа модели ход хука относится к модели unknown", () => {
    const state = newTranscriptState();

    const [bucket] = attributeLine(hookFeedbackLine("2026-09-19T09:00:00.000Z"), state, PROJECT_OF);

    expect(bucket?.model).toBe("unknown");
  });

  it("мета-сообщение и результат инструмента не закрывают ход хука, настоящее сообщение пользователя закрывает", () => {
    const state = newTranscriptState();
    attributeLine(hookFeedbackLine("2026-09-19T09:00:00.000Z"), state, PROJECT_OF);
    attributeLine(assistantLine("2026-09-19T09:00:01.000Z", "claude-opus-5", usage(10, 5), [bashToolUse("toolu_9", "backlog list")]), state, PROJECT_OF);

    attributeLine(toolResultLine("2026-09-19T09:00:02.000Z", "toolu_9", "SPA-1"), state, PROJECT_OF);
    const stillOpen = attributeLine(assistantLine("2026-09-19T09:00:03.000Z", "claude-opus-5", usage(1, 1)), state, PROJECT_OF);
    expect(stillOpen.some((bucket) => bucket.kind === "hook")).toBe(true);

    attributeLine(realUserLine("2026-09-19T09:00:04.000Z"), state, PROJECT_OF);
    const afterClose = attributeLine(assistantLine("2026-09-19T09:00:05.000Z", "claude-opus-5", usage(1, 1)), state, PROJECT_OF);
    expect(afterClose.some((bucket) => bucket.kind === "hook")).toBe(false);
  });

  it("Bash с backlog в начале команды даёт оценку по длине результата у модели следующего ответа", () => {
    const state = newTranscriptState();
    attributeLine(assistantLine("2026-09-19T10:00:00.000Z", "claude-sonnet-5", usage(5, 5), [bashToolUse("toolu_1", "cd x && backlog list")]), state, PROJECT_OF);
    attributeLine(toolResultLine("2026-09-19T10:00:01.000Z", "toolu_1", "a".repeat(30)), state, PROJECT_OF);

    const [estimate] = attributeLine(assistantLine("2026-09-19T10:00:02.000Z", "claude-opus-5", usage(1, 1)), state, PROJECT_OF);

    expect(estimate).toMatchObject({ kind: "cli", model: "claude-opus-5", tokens: { cacheWrite5m: 10 } });
  });

  it("оценка использует день и проект строки tool_result, а не строки ответа модели", () => {
    const state = newTranscriptState();
    const otherProject = (cwd: string): string | null => (cwd.includes("other") ? "OTHER" : PROJECT_OF(cwd));
    const toolResultTimestamp = "2026-09-10T12:00:00.000Z";
    const expectedDay = formatLocalIso(new Date(toolResultTimestamp)).slice(0, 10);

    attributeLine(assistantLine("2026-08-01T10:00:00.000Z", "claude-sonnet-5", usage(5, 5), [bashToolUse("toolu_1", "backlog list")]), state, otherProject);
    attributeLine({ type: "user", timestamp: toolResultTimestamp, cwd: "/Users/x/projects/other", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "abc" }] } }, state, otherProject);

    const [estimate] = attributeLine(assistantLine("2026-09-20T00:00:01.000Z", "claude-opus-5", usage(1, 1)), state, otherProject);

    expect(estimate).toMatchObject({ day: expectedDay, projectId: "OTHER" });
  });

  it("Bash без backlog в начале команды не учитывается", () => {
    const state = newTranscriptState();
    attributeLine(assistantLine("2026-09-19T10:00:00.000Z", "claude-sonnet-5", usage(5, 5), [bashToolUse("toolu_2", "echo backlogs")]), state, PROJECT_OF);
    attributeLine(toolResultLine("2026-09-19T10:00:01.000Z", "toolu_2", "backlogs"), state, PROJECT_OF);

    const buckets = attributeLine(assistantLine("2026-09-19T10:00:02.000Z", "claude-opus-5", usage(1, 1)), state, PROJECT_OF);

    expect(buckets.some((bucket) => bucket.kind === "cli")).toBe(false);
  });

  it("загрузка скилла backlog считается один раз — по тексту скилла, результат «Launching skill» не считается", () => {
    const state = newTranscriptState();
    const skillCall = { type: "tool_use", id: "toolu_5", name: "Skill", input: { skill: "backlog", args: "" } };
    attributeLine(assistantLine("2026-09-19T10:59:59.000Z", "claude-haiku-4-5", usage(1, 1), [skillCall]), state, PROJECT_OF);
    attributeLine(toolResultLine("2026-09-19T11:00:00.000Z", "toolu_5", "Launching skill: backlog"), state, PROJECT_OF);
    attributeLine(skillBodyLine("2026-09-19T11:00:00.500Z"), state, PROJECT_OF);

    const buckets = attributeLine(assistantLine("2026-09-19T11:00:01.000Z", "claude-haiku-4-5", usage(1, 1)), state, PROJECT_OF);

    expect(buckets.filter((bucket) => bucket.kind === "skill")).toHaveLength(1);
    expect(buckets).toContainEqual(expect.objectContaining({ kind: "skill", model: "claude-haiku-4-5" }));
  });

  it("проект строки определяется переданной функцией по cwd", () => {
    const state = newTranscriptState();
    const projectOf = (cwd: string): string | null => (cwd === CWD ? "SPA" : null);

    const [bucket] = attributeLine(hookFeedbackLine("2026-09-19T09:00:00.000Z"), state, projectOf);

    expect(bucket?.projectId).toBe("SPA");
  });

  it("ответ модели <synthetic> не учитывается и не запоминается как последняя модель", () => {
    const state = newTranscriptState();
    attributeLine(hookFeedbackLine("2026-09-19T09:00:00.000Z"), state, PROJECT_OF);

    const buckets = attributeLine(assistantLine("2026-09-19T09:00:01.000Z", "<synthetic>", usage(1000, 1000)), state, PROJECT_OF);

    expect(buckets).toEqual([]);
    expect(state.lastModel).toBeNull();
  });
});
