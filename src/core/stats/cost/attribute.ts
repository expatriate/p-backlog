import { z } from "zod";
import { formatLocalDay } from "../../model/dates";
import type { TokenCounts, TranscriptState, UsageBucket } from "../types";
import { fastModel } from "./pricing";

export type TranscriptLine = unknown;

type LineContext = { day: string; cwd: string };

const FAST_SPEED = "fast";

const CHARS_PER_TOKEN = 3;

const PENDING_TOOL_LIMIT = 64;

const BACKLOG_COMMAND = /(?:^|&&|\|\||;|\||\n)\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*backlog(?=\s|$)/;

const ZERO_TOKENS: TokenCounts = { input: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0 };

const usageSchema = z
  .object({
    input_tokens: z.number().optional(),
    output_tokens: z.number().optional(),
    cache_read_input_tokens: z.number().optional(),
    cache_creation_input_tokens: z.number().optional(),
    speed: z.string().optional(),
    cache_creation: z
      .object({ ephemeral_5m_input_tokens: z.number().optional(), ephemeral_1h_input_tokens: z.number().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

type Usage = z.infer<typeof usageSchema>;

const assistantMessageSchema = z
  .object({ id: z.string().optional(), model: z.string().optional(), usage: usageSchema.optional(), content: z.array(z.unknown()).optional() })
  .passthrough();

const userMessageSchema = z.object({ content: z.unknown().optional() }).passthrough();

const toolUseBlockSchema = z.object({ type: z.literal("tool_use"), id: z.string(), name: z.string(), input: z.unknown().optional() }).passthrough();

const toolResultBlockSchema = z.object({ type: z.literal("tool_result"), tool_use_id: z.string().optional(), content: z.unknown().optional() }).passthrough();

const textBlockSchema = z.object({ type: z.literal("text"), text: z.string() }).passthrough();

const bashInputSchema = z.object({ command: z.string() }).passthrough();


const lineSchema = z
  .object({ type: z.string().optional(), timestamp: z.string().optional(), cwd: z.string().optional(), isMeta: z.boolean().optional(), message: z.unknown().optional() })
  .passthrough();

export function newTranscriptState(): TranscriptState {
  return { hookOpen: false, lastModel: null, lastMessageId: null, pending: {}, pendingEstimates: [] };
}

export function attributeLine(line: TranscriptLine, state: TranscriptState): UsageBucket[] {
  const parsed = lineSchema.safeParse(line);
  if (!parsed.success) return [];
  const { type, timestamp, cwd, isMeta, message } = parsed.data;
  const context: LineContext = { day: typeof timestamp === "string" ? dayOf(timestamp) : "", cwd: cwd ?? "" };

  if (type === "assistant") return attributeAssistant(message, state, context);
  if (type === "user") return attributeUser(message, isMeta === true, state, context);
  return [];
}

function attributeAssistant(rawMessage: unknown, state: TranscriptState, context: LineContext): UsageBucket[] {
  const message = assistantMessageSchema.safeParse(rawMessage);
  if (!message.success) return [];
  const { id, model, usage, content } = message.data;
  const buckets: UsageBucket[] = [];
  const repeatOfCountedMessage = id !== undefined && id === state.lastMessageId;
  if (model && model !== "<synthetic>" && usage && !repeatOfCountedMessage) {
    const pricedModel = usage.speed === FAST_SPEED ? fastModel(model) : model;
    state.lastModel = pricedModel;
    state.lastMessageId = id ?? null;
    const tokens = tokensFrom(usage);
    if (state.hookOpen) buckets.push({ ...context, model: pricedModel, kind: "hook", tokens, hookTurns: 0 });
    buckets.push(...drainEstimates(state, pricedModel));
  }
  if (content) for (const block of content) registerToolUseBlock(block, state);
  return buckets;
}

function attributeUser(rawMessage: unknown, isMeta: boolean, state: TranscriptState, context: LineContext): UsageBucket[] {
  const message = userMessageSchema.safeParse(rawMessage);
  const content = message.success ? message.data.content : undefined;

  if (isToolResultOnly(content)) {
    resolveToolResults(content, state, context);
    return [];
  }

  if (isMeta) {
    const text = textOf(content);
    if (text.startsWith("Stop hook feedback:") && text.includes("Беклог ")) {
      state.hookOpen = true;
      return [{ ...context, model: state.lastModel ?? "unknown", kind: "hook", tokens: ZERO_TOKENS, hookTurns: 1 }];
    }
    if (!state.hookOpen && text.startsWith("Base directory for this skill:") && text.includes("/skills/backlog")) {
      state.pendingEstimates.push({ kind: "skill", chars: text.length, ...context });
    }
    return [];
  }

  state.hookOpen = false;
  return [];
}

function resolveToolResults(blocks: unknown[], state: TranscriptState, context: LineContext): void {
  for (const raw of blocks) {
    const block = toolResultBlockSchema.safeParse(raw);
    if (!block.success || !block.data.tool_use_id) continue;
    const kind = state.pending[block.data.tool_use_id];
    if (!kind) continue;
    if (!state.hookOpen) state.pendingEstimates.push({ kind, chars: textOf(block.data.content).length, ...context });
    Reflect.deleteProperty(state.pending, block.data.tool_use_id);
  }
}

function registerToolUseBlock(raw: unknown, state: TranscriptState): void {
  const block = toolUseBlockSchema.safeParse(raw);
  if (!block.success) return;
  if (block.data.name === "Bash") {
    const input = bashInputSchema.safeParse(block.data.input);
    if (!input.success || !BACKLOG_COMMAND.test(input.data.command)) return;
    state.pending[block.data.id] = "cli";
    forgetOldestPending(state);
  }
}

function forgetOldestPending(state: TranscriptState): void {
  const ids = Object.keys(state.pending);
  for (const id of ids.slice(0, Math.max(0, ids.length - PENDING_TOOL_LIMIT))) Reflect.deleteProperty(state.pending, id);
}

export function flushEstimates(state: TranscriptState): UsageBucket[] {
  return state.lastModel === null ? [] : drainEstimates(state, state.lastModel);
}

function drainEstimates(state: TranscriptState, model: string): UsageBucket[] {
  const buckets = state.pendingEstimates.map(
    (estimate): UsageBucket => ({
      day: estimate.day,
      cwd: estimate.cwd,
      model,
      kind: estimate.kind,
      tokens: { ...ZERO_TOKENS, cacheWrite5m: Math.ceil(estimate.chars / CHARS_PER_TOKEN) },
      hookTurns: 0,
    }),
  );
  state.pendingEstimates = [];
  return buckets;
}

function isToolResultOnly(content: unknown): content is unknown[] {
  return Array.isArray(content) && content.length > 0 && content.every((block) => toolResultBlockSchema.safeParse(block).success);
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      const parsed = textBlockSchema.safeParse(block);
      return parsed.success ? parsed.data.text : "";
    })
    .join("");
}

function tokensFrom(usage: Usage): TokenCounts {
  const creation = usage.cache_creation;
  const cacheWrite5m = creation ? (creation.ephemeral_5m_input_tokens ?? 0) : (usage.cache_creation_input_tokens ?? 0);
  const cacheWrite1h = creation ? (creation.ephemeral_1h_input_tokens ?? 0) : 0;
  return { input: usage.input_tokens ?? 0, cacheWrite5m, cacheWrite1h, cacheRead: usage.cache_read_input_tokens ?? 0, output: usage.output_tokens ?? 0 };
}

function dayOf(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "" : formatLocalDay(date);
}
