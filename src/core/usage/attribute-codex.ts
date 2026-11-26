import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { isBacklogHookFeedback, isBacklogHookReason } from "../hook-signature";
import { SKILL_NAME } from "../skill-name";
import { parseJson } from "../store/json-file";
import { estimateTextTokens, rememberToolCall, slotOf } from "../stats/cost/attribute";
import { modelKey } from "../stats/cost/pricing";
import { invokesOnlyBacklog, isSingleShellCommand } from "../stats/cost/shell-commands";
import { tokensGrowth, totalTokens, ZERO_TOKENS, type TokenCounts } from "../stats/cost/token-counts";
import type { TranscriptState, UsageBucket } from "../stats/cost/usage-state";

type CodexState = NonNullable<TranscriptState["codex"]>;
type UsageContext = Pick<UsageBucket, "slot" | "cwd" | "model">;

const ROLLOUT_MARKERS = /"type"\s*:\s*"(?:session_meta|turn_context|token_count|item_completed|message|function_call(?:_output)?|custom_tool_call(?:_output)?)"/u;
const INLINE_SHELL_FIELDS = /\b(cmd|workdir)\s*:\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`)/gu;
const APP_TOOL_CALL = /\btools\.(\w+)\s*\(/gu;
const SKILL_READER = /^\s*(?:cat|sed|head|tail|nl|Get-Content)\b/iu;
const SHELL_PROGRAM = /(?:^|[\\/])(?:bash|zsh|sh|dash|ksh|fish|pwsh|powershell|cmd)(?:\.exe)?$/iu;
const SHELL_SCRIPT_FLAG = /^(?:-[il]*c|-command|\/c)$/iu;
const STOP_HOOK_PROMPT = /^<hook_prompt hook_run_id="stop:[^"]+">\s*([\s\S]*?)<\/hook_prompt>$/u;

const rolloutSchema = z.object({
  type: z.string(),
  timestamp: z.string(),
  payload: z
    .object({
      type: z.string().optional(),
      cwd: z.string().optional(),
      model: z.string().min(1).optional(),
      originator: z.string().optional(),
      history_mode: z.string().optional(),
    })
    .passthrough(),
});

const usageSchema = z.object({
  input_tokens: z.number().nonnegative(),
  cached_input_tokens: z.number().nonnegative().default(0),
  cache_write_input_tokens: z.number().nonnegative().default(0),
  output_tokens: z.number().nonnegative(),
});
type CodexUsage = z.infer<typeof usageSchema>;

const eventSchema = z.object({ info: z.object({ total_token_usage: usageSchema, last_token_usage: usageSchema.optional() }) });
const completedCommandSchema = z.object({
  item: z.object({
    type: z.literal("CommandExecution"),
    id: z.string().startsWith("exec-"),
    source: z.literal("unified_exec_startup"),
    cwd: z.string().min(1),
    command: z.tuple([z.string()], z.string()),
    aggregated_output: z.string(),
  }),
});
const messageSchema = z.object({ role: z.string(), content: z.array(z.object({ text: z.string().optional() })) });
const callSchema = z.object({ name: z.string(), call_id: z.string(), arguments: z.string().optional(), input: z.string().optional() });
const shellSchema = z.object({ cmd: z.string().optional(), command: z.string().optional(), workdir: z.string().optional() });
const textOutputSchema = z.object({ type: z.literal("input_text"), text: z.string() });
const resultSchema = z.object({ call_id: z.string(), output: z.union([z.string(), z.array(z.unknown())]) });

export function attributeCodexLine(line: string, state: TranscriptState): UsageBucket[] {
  if (!ROLLOUT_MARKERS.test(line)) return [];
  const event = parseJson(line, rolloutSchema);
  if (event === null) return [];
  const codex = (state.codex ??= { cwd: "", total: null });
  const { type, timestamp, payload } = event;
  if (type === "session_meta" || type === "turn_context") {
    if (type === "session_meta" && payload.originator === "Codex Desktop" && payload.history_mode === "paginated") codex.desktopCommandEvents = true;
    codex.cwd = payload.cwd ?? codex.cwd;
    state.lastModel = payload.model ?? state.lastModel;
    return [];
  }
  const context = { cwd: codex.cwd, model: state.lastModel ?? "unknown", slot: slotOf(timestamp) };
  if (type === "event_msg" && payload.type === "token_count") return tokenBuckets(payload, state, codex, context);
  if (type === "event_msg" && payload.type === "item_completed" && codex.desktopCommandEvents && !state.hookOpen) return desktopCommandBuckets(payload, context);
  if (type === "response_item") return responseBuckets(payload, state, codex, context);
  return [];
}

function desktopCommandBuckets(payload: unknown, context: UsageContext): UsageBucket[] {
  const completed = completedCommandSchema.safeParse(payload);
  if (!completed.success) return [];
  const { cwd, command, aggregated_output: output } = completed.data.item;
  const [program, ...args] = command;
  const script = SHELL_PROGRAM.test(program) && SHELL_SCRIPT_FLAG.test(args.at(-2) ?? "") ? args.at(-1) : program;
  if (script === undefined || !invokesOnlyBacklog(script)) return [];
  return estimatedOutput(output.length, "cli", { ...context, cwd: commandDirectory(cwd) });
}

function commandDirectory(cwd: string): string {
  if (!cwd.startsWith("file:")) return cwd;
  try {
    return fileURLToPath(cwd);
  } catch (error) {
    if (!(error instanceof TypeError || error instanceof URIError)) throw error;
    return cwd;
  }
}

function tokenBuckets(payload: unknown, state: TranscriptState, codex: CodexState, context: UsageContext): UsageBucket[] {
  const event = eventSchema.safeParse(payload);
  if (!event.success) return [];
  const { total_token_usage: usage, last_token_usage: last } = event.data.info;
  const total = tokensOf(usage);
  const tokens = codex.total === null ? tokensOf(last ?? usage) : tokensGrowth(codex.total, total);
  codex.total = total;
  if (!state.hookOpen || totalTokens(tokens) === 0) return [];
  const model = modelKey({ model: context.model, fast: false, tokens });
  return [{ ...context, model, kind: "hook", tokens, hookTurns: 0 }];
}

function tokensOf(usage: CodexUsage): TokenCounts {
  const cacheRead = Math.min(usage.input_tokens, usage.cached_input_tokens);
  const cacheWrite5m = Math.min(usage.input_tokens - cacheRead, usage.cache_write_input_tokens);
  return { input: usage.input_tokens - cacheRead - cacheWrite5m, output: usage.output_tokens, cacheWrite5m, cacheWrite1h: 0, cacheRead };
}

function responseBuckets(payload: z.infer<typeof rolloutSchema>["payload"], state: TranscriptState, codex: CodexState, context: UsageContext): UsageBucket[] {
  switch (payload.type) {
    case "message": {
      const message = messageSchema.safeParse(payload);
      if (!message.success || message.data.role !== "user") return [];
      state.hookOpen = message.data.content.some(({ text }) => isBacklogPrompt(text?.trim() ?? ""));
      return state.hookOpen ? [{ ...context, kind: "hook", tokens: ZERO_TOKENS, hookTurns: 1 }] : [];
    }
    case "function_call":
    case "custom_tool_call": {
      const call = callSchema.safeParse(payload);
      if (call.success) rememberBacklogCall(call.data, state, codex);
      return [];
    }
    case "function_call_output":
    case "custom_tool_call_output":
      return toolOutputBuckets(payload, state, codex, context);
    case undefined:
    default:
      return [];
  }
}

function isBacklogPrompt(text: string): boolean {
  return isBacklogHookFeedback(text) || isBacklogHookReason(STOP_HOOK_PROMPT.exec(text)?.[1] ?? "");
}

function rememberBacklogCall(call: z.infer<typeof callSchema>, state: TranscriptState, codex: CodexState): void {
  const { commands, workdir } = shellDetails(call);
  if (commands.length === 0) return;
  if (!(codex.desktopCommandEvents && call.name === "exec") && commands.every(invokesOnlyBacklog)) rememberToolCall(state, call.call_id, "cli");
  else if (commands.every(readsBacklogSkill)) rememberToolCall(state, call.call_id, "skill");
  if (workdir && Object.hasOwn(state.pending, call.call_id)) {
    codex.toolDirectories ??= {};
    const cwd = resolve(codex.cwd, workdir);
    codex.toolDirectories = { ...codex.toolDirectories, [call.call_id]: cwd };
  }
  for (const id of Object.keys(codex.toolDirectories ?? {})) {
    if (!Object.hasOwn(state.pending, id) && codex.toolDirectories !== undefined) Reflect.deleteProperty(codex.toolDirectories, id);
  }
}

function shellDetails(call: z.infer<typeof callSchema>): { commands: string[]; workdir?: string | undefined } {
  if (call.name === "exec_command" || call.name === "shell_command") {
    const shell = parseJson(call.arguments ?? "", shellSchema);
    const command = shell?.cmd ?? shell?.command;
    return { commands: command === undefined ? [] : [command], workdir: shell?.workdir };
  }
  if (call.name !== "exec" || !call.input?.includes("tools.exec_command")) return { commands: [] };
  const tools = [...call.input.matchAll(APP_TOOL_CALL)];
  if (tools.some(([, name]) => name !== "exec_command")) return { commands: [] };
  const commands: string[] = [];
  const workdirs: string[] = [];
  for (const [, field, literal = ""] of call.input.matchAll(INLINE_SHELL_FIELDS)) {
    const fields = field === "cmd" ? commands : workdirs;
    fields.push(parseJson(literal, z.string()) ?? literal.slice(1, -1).replaceAll("\\n", "\n"));
  }
  if (commands.length !== tools.length || (workdirs.length > 0 && commands.length !== 1)) return { commands: [] };
  return { commands, workdir: workdirs[0] };
}

function readsBacklogSkill(command: string): boolean {
  return SKILL_READER.test(command) && command.replaceAll("\\", "/").includes(`/${SKILL_NAME}/SKILL.md`) && isSingleShellCommand(command);
}

function toolOutputBuckets(payload: unknown, state: TranscriptState, codex: CodexState, context: UsageContext): UsageBucket[] {
  const result = resultSchema.safeParse(payload);
  if (!result.success) return [];
  const { call_id: id, output } = result.data;
  if (!Object.hasOwn(state.pending, id)) return [];
  const kind = state.pending[id];
  Reflect.deleteProperty(state.pending, id);
  const directories = codex.toolDirectories ?? {};
  const cwd = Object.hasOwn(directories, id) ? (directories[id] ?? context.cwd) : context.cwd;
  Reflect.deleteProperty(directories, id);
  if (state.hookOpen || kind === undefined) return [];
  const chars = typeof output === "string" ? output.length : output.reduce<number>((total, part) => total + (textOutputSchema.safeParse(part).data?.text.length ?? 0), 0);
  return estimatedOutput(chars, kind, { ...context, cwd });
}

function estimatedOutput(chars: number, kind: "cli" | "skill", context: UsageContext): UsageBucket[] {
  if (chars === 0) return [];
  return [{ ...context, kind, tokens: { ...ZERO_TOKENS, input: estimateTextTokens(chars) }, hookTurns: 0 }];
}
