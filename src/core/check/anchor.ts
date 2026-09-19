import { createHash } from "node:crypto";

export type LineSpan = { from: number; to: number };

const LINE_SUFFIX = /:(\d+)(?:-(\d+))?$/;
const CONTEXT_LINES = 2;
const ANCHOR_LENGTH = 12;
const SNIPPET_CONTEXT = 3;
const LINE_NUMBER_WIDTH = 5;

export function sourceLines(source: string): LineSpan | null {
  const match = LINE_SUFFIX.exec(source);
  if (match === null) return null;
  const first = Number(match[1]);
  if (match[2] !== undefined) return { from: first, to: Number(match[2]) };
  return { from: Math.max(1, first - CONTEXT_LINES), to: first + CONTEXT_LINES };
}

export function anchorOf(text: string, source: string): string | null {
  const span = sourceLines(source);
  const lines = text.split("\n");
  if (span === null || span.from > lines.length) return null;
  return hashLines(lines.slice(span.from - 1, span.to));
}

export function findMoved(text: string, source: string, anchor: string): string | null {
  const span = sourceLines(source);
  if (span === null) return null;
  const lines = text.split("\n");
  const length = span.to - span.from + 1;
  let best: number | null = null;
  for (let start = 1; start + length - 1 <= lines.length; start++) {
    if (hashLines(lines.slice(start - 1, start - 1 + length)) !== anchor) continue;
    if (best === null || Math.abs(start - span.from) < Math.abs(best - span.from)) best = start;
  }
  if (best === null) return null;
  const shift = best - span.from;
  const match = LINE_SUFFIX.exec(source);
  const first = Number(match?.[1]) + shift;
  return withLines(source, first, match?.[2] === undefined ? undefined : Number(match[2]) + shift);
}

export function snippetOf(text: string, source: string): string | undefined {
  const span = sourceLines(source);
  const lines = text.split("\n");
  if (span === null || span.from > lines.length) return undefined;
  const from = Math.max(1, span.from - SNIPPET_CONTEXT);
  const to = Math.min(lines.length, span.to + SNIPPET_CONTEXT);
  return lines
    .slice(from - 1, to)
    .map((line, index) => `${String(from + index).padStart(LINE_NUMBER_WIDTH)}│ ${line}`)
    .join("\n");
}

export function withLines(source: string, first: number, last?: number): string {
  return `${source.replace(LINE_SUFFIX, "")}:${last === undefined ? first : `${first}-${last}`}`;
}

function hashLines(lines: readonly string[]): string {
  const fragment = lines.map((line) => line.trimEnd()).join("\n");
  return createHash("sha1").update(fragment).digest("hex").slice(0, ANCHOR_LENGTH);
}
