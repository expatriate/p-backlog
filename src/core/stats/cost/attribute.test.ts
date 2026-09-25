import { describe, expect, it } from "vitest";
import { attributeLine, newTranscriptState } from "./attribute";
import { isBacklogHookFeedback } from "./hook-signature";
import { fastModel } from "./pricing";

const CWD = "/Users/x/projects/spa";

function assistantLine(timestamp: string, model: string, usage: Record<string, unknown> | null, content: unknown[] = [], id?: string) {
  return { type: "assistant", timestamp, cwd: CWD, isSidechain: false, message: { ...(id ? { id } : {}), model, ...(usage ? { usage } : {}), content } };
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

    const opened = attributeLine(hookFeedbackLine("2026-09-19T09:00:00.000Z"), state);
    const first = attributeLine(assistantLine("2026-09-19T09:00:01.000Z", "claude-opus-5", usage(100, 20)), state);
    const second = attributeLine(assistantLine("2026-09-19T09:00:02.000Z", "claude-opus-5", usage(50, 10)), state);

    const buckets = [...opened, ...first, ...second];
    expect(buckets.every((bucket) => bucket.kind === "hook")).toBe(true);
    expect(buckets.reduce((sum, bucket) => sum + bucket.hookTurns, 0)).toBe(1);
    expect(first[0]?.tokens).toMatchObject({ input: 100, output: 20 });
  });

  it("до первого ответа модели ход хука относится к модели unknown", () => {
    const state = newTranscriptState();

    const [bucket] = attributeLine(hookFeedbackLine("2026-09-19T09:00:00.000Z"), state);

    expect(bucket?.model).toBe("unknown");
  });

  it("мета-сообщение и результат инструмента не закрывают ход хука, настоящее сообщение пользователя закрывает", () => {
    const state = newTranscriptState();
    attributeLine(hookFeedbackLine("2026-09-19T09:00:00.000Z"), state);
    attributeLine(assistantLine("2026-09-19T09:00:01.000Z", "claude-opus-5", usage(10, 5), [bashToolUse("toolu_9", "backlog list")]), state);

    attributeLine(toolResultLine("2026-09-19T09:00:02.000Z", "toolu_9", "SPA-1"), state);
    const stillOpen = attributeLine(assistantLine("2026-09-19T09:00:03.000Z", "claude-opus-5", usage(1, 1)), state);
    expect(stillOpen.some((bucket) => bucket.kind === "hook")).toBe(true);

    attributeLine(realUserLine("2026-09-19T09:00:04.000Z"), state);
    const afterClose = attributeLine(assistantLine("2026-09-19T09:00:05.000Z", "claude-opus-5", usage(1, 1)), state);
    expect(afterClose.some((bucket) => bucket.kind === "hook")).toBe(false);
  });

  it("Bash с backlog в начале команды даёт оценку по длине результата у модели следующего ответа", () => {
    const state = newTranscriptState();
    attributeLine(assistantLine("2026-09-19T10:00:00.000Z", "claude-sonnet-5", usage(5, 5), [bashToolUse("toolu_1", "cd x && backlog list")]), state);
    attributeLine(toolResultLine("2026-09-19T10:00:01.000Z", "toolu_1", "a".repeat(30)), state);

    const [estimate] = attributeLine(assistantLine("2026-09-19T10:00:02.000Z", "claude-opus-5", usage(1, 1)), state);

    expect(estimate).toMatchObject({ kind: "cli", model: "claude-opus-5", tokens: { cacheWrite5m: 10 } });
  });

  it("оценка использует время и cwd строки tool_result, а не строки ответа модели", () => {
    const state = newTranscriptState();
    const toolResultTimestamp = "2026-09-10T12:07:30.000Z";

    attributeLine(assistantLine("2026-08-01T10:00:00.000Z", "claude-sonnet-5", usage(5, 5), [bashToolUse("toolu_1", "backlog list")]), state);
    attributeLine({ type: "user", timestamp: toolResultTimestamp, cwd: "/Users/x/projects/other", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "abc" }] } }, state);

    const [estimate] = attributeLine(assistantLine("2026-09-20T00:00:01.000Z", "claude-opus-5", usage(1, 1)), state);

    expect(estimate).toMatchObject({ slot: "2026-09-10T12:00:00.000Z", cwd: "/Users/x/projects/other" });
  });

  it("Bash без backlog в начале команды не учитывается", () => {
    const state = newTranscriptState();
    attributeLine(assistantLine("2026-09-19T10:00:00.000Z", "claude-sonnet-5", usage(5, 5), [bashToolUse("toolu_2", "echo backlogs")]), state);
    attributeLine(toolResultLine("2026-09-19T10:00:01.000Z", "toolu_2", "backlogs"), state);

    const buckets = attributeLine(assistantLine("2026-09-19T10:00:02.000Z", "claude-opus-5", usage(1, 1)), state);

    expect(buckets.some((bucket) => bucket.kind === "cli")).toBe(false);
  });

  it("загрузка скилла backlog считается один раз — по тексту скилла, результат «Launching skill» не считается", () => {
    const state = newTranscriptState();
    const skillCall = { type: "tool_use", id: "toolu_5", name: "Skill", input: { skill: "backlog", args: "" } };
    attributeLine(assistantLine("2026-09-19T10:59:59.000Z", "claude-haiku-4-5", usage(1, 1), [skillCall]), state);
    attributeLine(toolResultLine("2026-09-19T11:00:00.000Z", "toolu_5", "Launching skill: backlog"), state);
    attributeLine(skillBodyLine("2026-09-19T11:00:00.500Z"), state);

    const buckets = attributeLine(assistantLine("2026-09-19T11:00:01.000Z", "claude-haiku-4-5", usage(1, 1)), state);

    expect(buckets.filter((bucket) => bucket.kind === "skill")).toHaveLength(1);
    expect(buckets).toContainEqual(expect.objectContaining({ kind: "skill", model: "claude-haiku-4-5" }));
  });

  it("блоки одного ответа модели с общим message.id учитываются один раз", () => {
    const state = newTranscriptState();
    attributeLine(hookFeedbackLine("2026-09-19T09:00:00.000Z"), state);

    const thinking = attributeLine(assistantLine("2026-09-19T09:00:01.000Z", "claude-opus-5", usage(100, 20), [], "msg_1"), state);
    const toolUse = attributeLine(assistantLine("2026-09-19T09:00:02.000Z", "claude-opus-5", usage(100, 20), [bashToolUse("toolu_7", "backlog list")], "msg_1"), state);
    const nextReply = attributeLine(assistantLine("2026-09-19T09:00:03.000Z", "claude-opus-5", usage(50, 10), [], "msg_2"), state);

    expect([...thinking, ...toolUse, ...nextReply].filter((bucket) => bucket.kind === "hook").map((bucket) => bucket.tokens.input)).toEqual([100, 50]);
    expect(state.pending).toEqual({ toolu_7: "cli" });
  });

  it("usage, выросший в следующей строке того же message.id, учитывается по итоговому значению", () => {
    const state = newTranscriptState();
    attributeLine(hookFeedbackLine("2026-09-19T09:00:00.000Z"), state);

    const early = attributeLine(assistantLine("2026-09-19T09:00:01.000Z", "claude-opus-5", usage(100, 1), [], "msg_1"), state);
    const final = attributeLine(assistantLine("2026-09-19T09:00:02.000Z", "claude-opus-5", usage(100, 20), [], "msg_1"), state);

    const counted = [...early, ...final].filter((bucket) => bucket.kind === "hook");
    expect(counted.reduce((sum, bucket) => sum + bucket.tokens.output, 0)).toBe(20);
    expect(counted.reduce((sum, bucket) => sum + bucket.tokens.input, 0)).toBe(100);
  });

  it("ответ модели <synthetic> не учитывается и не запоминается как последняя модель", () => {
    const state = newTranscriptState();
    attributeLine(hookFeedbackLine("2026-09-19T09:00:00.000Z"), state);

    const buckets = attributeLine(assistantLine("2026-09-19T09:00:01.000Z", "<synthetic>", usage(1000, 1000)), state);

    expect(buckets).toEqual([]);
    expect(state.lastModel).toBeNull();
  });

  it("ответ в быстром режиме относится к отдельной модели с ценой быстрого режима", () => {
    const state = newTranscriptState();
    attributeLine(hookFeedbackLine("2026-09-19T09:00:00.000Z"), state);

    const [bucket] = attributeLine(assistantLine("2026-09-19T09:00:01.000Z", "claude-opus-5", { ...usage(100, 20), speed: "fast" }), state);

    expect(bucket?.model).toBe(fastModel("claude-opus-5"));
  });

  it("вывод backlog внутри хода хука не оценивается отдельно: он уже во входе ответов хода", () => {
    const state = newTranscriptState();
    attributeLine(hookFeedbackLine("2026-09-19T09:00:00.000Z"), state);
    attributeLine(assistantLine("2026-09-19T09:00:01.000Z", "claude-opus-5", usage(10, 5), [bashToolUse("toolu_3", "backlog check --json")]), state);
    attributeLine(toolResultLine("2026-09-19T09:00:02.000Z", "toolu_3", "a".repeat(300)), state);

    const next = attributeLine(assistantLine("2026-09-19T09:00:03.000Z", "claude-opus-5", usage(1, 1)), state);

    expect(next.map((bucket) => bucket.kind)).toEqual(["hook"]);
  });

  it("команда backlog узнаётся после присваиваний окружения, а пути и похожие слова — нет", () => {
    const counted = (command: string) => {
      const state = newTranscriptState();
      attributeLine(assistantLine("2026-09-19T10:00:00.000Z", "claude-sonnet-5", usage(5, 5), [bashToolUse("toolu_1", command)]), state);
      return state.pending.toolu_1 === "cli";
    };

    expect(["BACKLOG_DIR=/tmp/x backlog list", "cd x; FOO=1 BAR=2 backlog show PB-1", "backlog", "git status && backlog check --json"].map(counted)).toEqual([true, true, true, true]);
    expect(["ls backlog/", "cat ~/backlog/p/PB-1.md", "backlog-web start", "echo backlogs"].map(counted)).toEqual([false, false, false, false]);
  });

  it("команда backlog узнаётся в подоболочке, подстановке и через npx, но не внутри heredoc и строк", () => {
    const counted = (command: string) => {
      const state = newTranscriptState();
      attributeLine(assistantLine("2026-09-19T10:00:00.000Z", "claude-sonnet-5", usage(5, 5), [bashToolUse("toolu_1", command)]), state);
      return state.pending.toolu_1 === "cli";
    };

    expect(["(cd x; backlog list)", "echo $(backlog list --json)", "npx p-backlog stats", "npx -y p-backlog list", "backlog new --title x <<'EOF'\nтело\nEOF"].map(counted)).toEqual([true, true, true, true, true]);
    expect(["cat <<'EOF' > notes.md\nbacklog list\nEOF", 'git commit -m "fix\n\nbacklog list"', "echo 'a; backlog list'"].map(counted)).toEqual([false, false, false]);
  });

  it("команда backlog узнаётся за ключевыми словами оболочки, обёртками, путём к бинарнику и раннерами пакетов", () => {
    const counted = (command: string) => {
      const state = newTranscriptState();
      attributeLine(assistantLine("2026-09-19T10:00:00.000Z", "claude-sonnet-5", usage(5, 5), [bashToolUse("toolu_1", command)]), state);
      return state.pending.toolu_1 === "cli";
    };
    const invoking = [
      "for id in PB-1 PB-2; do backlog show $id; done",
      "if backlog list; then echo ok; fi",
      "! backlog check",
      "time backlog list",
      "env FOO=1 backlog list",
      "timeout 30 backlog check",
      "xargs -n 1 backlog show < ids",
      "sudo -E backlog list",
      "./node_modules/.bin/backlog list",
      "backlog.cmd list",
      "npx p-backlog@latest stats",
      "npx --package=p-backlog backlog list",
      "npx -p p-backlog backlog list",
      "pnpm dlx p-backlog list",
      "bunx p-backlog list",
      'echo "$(backlog list --json)"',
      "echo $((1 << 3))\nbacklog list",
      "n=$((1<<10))\nbacklog stats",
      "command backlog list",
      "\\backlog list",
      "sudo -u user backlog list",
      "xargs -I % backlog show %",
      "env -u VAR backlog list",
      "timeout -s KILL 30 backlog check",
      "npx backlog list",
      "npm exec backlog list",
      "pnpm exec backlog list",
      "yarn backlog list",
    ];
    const notInvoking = [
      "command -v backlog",
      "npx eslint p-backlog",
      "git commit -m \"$(cat <<'EOF'\nfix: one \" quote\nbacklog list now\nEOF\n)\"",
      "echo x # ; backlog list",
    ];

    expect(invoking.filter((command) => !counted(command))).toEqual([]);
    expect(notInvoking.filter(counted)).toEqual([]);
  });

  it("ход хука узнаётся и по английскому маркеру: смена языка не обнуляет затраты на хук", () => {
    expect(isBacklogHookFeedback("Stop hook feedback:\nBacklog spa: code changed for tasks — SPA-1")).toBe(true);
    expect(isBacklogHookFeedback("Stop hook feedback:\nБеклог spa: после последней проверки менялся код задач — SPA-1")).toBe(true);
  });
});
