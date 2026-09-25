import { createHash } from "node:crypto";
import { z } from "zod";
import { parseJson } from "../../core/store/fs-utils";
import type { Agent } from "./agent";

export type StopEvent = { cwd: string; session: string | undefined; turn: string | undefined; skip: boolean };

export type StopAnswer = { reason: string | null; systemMessage: string | null };

type StopProtocol = "claude" | "cursor";

const STOP_PROTOCOL: Record<Agent, StopProtocol> = { claude: "claude", codex: "claude", cursor: "cursor" };
const TURN_DIGEST_LENGTH = 16;
const CURSOR_COMPLETED = "completed";

const claudeEventSchema = z.object({
  cwd: z.string(),
  session_id: z.string().optional(),
  turn_id: z.string().optional(),
  stop_hook_active: z.boolean().optional(),
  last_assistant_message: z.string().nullish(),
});

const cursorEventSchema = z.object({
  workspace_roots: z.tuple([z.string()], z.string()),
  conversation_id: z.string().optional(),
  generation_id: z.string().optional(),
  status: z.string().optional(),
  loop_count: z.number().optional(),
});

export function parseStopEvent(agent: Agent, text: string): StopEvent | null {
  return STOP_PROTOCOL[agent] === "cursor" ? parseCursorEvent(text) : parseClaudeEvent(text);
}

export function carriesSystemMessage(agent: Agent): boolean {
  return STOP_PROTOCOL[agent] === "claude";
}

export function formatStopAnswer(agent: Agent, answer: StopAnswer): string | null {
  if (STOP_PROTOCOL[agent] === "cursor") return answer.reason === null ? null : JSON.stringify({ followup_message: answer.reason });
  const response = {
    ...(answer.reason !== null ? { decision: "block", reason: answer.reason } : {}),
    ...(answer.systemMessage !== null ? { systemMessage: answer.systemMessage } : {}),
  };
  return Object.keys(response).length > 0 ? JSON.stringify(response) : null;
}

function parseClaudeEvent(text: string): StopEvent | null {
  const event = parseJson(text, claudeEventSchema);
  if (event === null) return null;
  return { cwd: event.cwd, session: event.session_id, turn: event.turn_id ?? digest(event.last_assistant_message), skip: event.stop_hook_active === true };
}

function parseCursorEvent(text: string): StopEvent | null {
  const event = parseJson(text, cursorEventSchema);
  if (event === null) return null;
  const followsOurFollowUp = (event.loop_count ?? 0) > 0;
  const interrupted = (event.status ?? CURSOR_COMPLETED) !== CURSOR_COMPLETED;
  return { cwd: event.workspace_roots[0], session: event.conversation_id, turn: event.generation_id, skip: followsOurFollowUp || interrupted };
}

function digest(text: string | null | undefined): string | undefined {
  return text ? createHash("sha256").update(text).digest("hex").slice(0, TURN_DIGEST_LENGTH) : undefined;
}
