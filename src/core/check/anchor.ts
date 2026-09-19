import { createHash } from "node:crypto";

export const SOURCE_LINES = /:(\d+)(?:-(\d+))?$/;

type SourceSpan = { first: number; last: number; context: number };
type Window = { from: number; to: number };

const LINE_CONTEXT = 2;
const SNIPPET_CONTEXT = 5;
const HASH_LENGTH = 12;
const LINE_NUMBER_WIDTH = 5;
const MIN_MOVABLE_CHARS = 24;
const ANCHOR_FORMAT = /^([0-9a-f]+)@(\d+)-(\d+)$/;

export function anchorOf(text: string, source: string): string | null {
  const span = sourceSpan(source);
  const lines = fileLines(text);
  const window = span === null ? null : windowOf(span, lines.length);
  return window === null ? null : `${hashLines(lines.slice(window.from - 1, window.to))}@${window.from}-${window.to}`;
}

export function isAnchorFor(anchor: string, source: string): boolean {
  const parsed = parseAnchor(anchor);
  const span = sourceSpan(source);
  if (parsed === null || span === null) return false;
  return parsed.from === Math.max(1, span.first - span.context) && parsed.to >= span.first && parsed.to <= span.last + span.context;
}

export function findMoved(text: string, source: string, anchor: string): string | null {
  const parsed = parseAnchor(anchor);
  const span = sourceSpan(source);
  if (parsed === null || span === null) return null;
  const lines = fileLines(text);
  const length = parsed.to - parsed.from + 1;
  const matches: number[] = [];
  for (let start = 1; start + length - 1 <= lines.length; start++) {
    if (hashLines(lines.slice(start - 1, start - 1 + length)) === parsed.hash) matches.push(start);
  }
  const [start] = matches;
  if (matches.length !== 1 || start === undefined) return null;
  if (significantChars(lines.slice(start - 1, start - 1 + length)) < MIN_MOVABLE_CHARS) return null;
  const shift = start - parsed.from;
  return withLines(source, span.first + shift, span.context === 0 ? span.last + shift : undefined);
}

export function snippetOf(text: string, source: string): string | undefined {
  const span = sourceSpan(source);
  const lines = fileLines(text);
  if (span === null || span.first > lines.length) return undefined;
  const from = Math.max(1, span.first - SNIPPET_CONTEXT);
  const to = Math.min(lines.length, span.last + SNIPPET_CONTEXT);
  return lines
    .slice(from - 1, to)
    .map((line, index) => `${String(from + index).padStart(LINE_NUMBER_WIDTH)}│ ${line.trimEnd()}`)
    .join("\n");
}

export function withLines(source: string, first: number, last?: number): string {
  return `${source.replace(SOURCE_LINES, "")}:${last === undefined ? first : `${first}-${last}`}`;
}

export function lineSuffix(source: string): string {
  return SOURCE_LINES.exec(source)?.[0] ?? "";
}

export function hasLines(source: string): boolean {
  return SOURCE_LINES.test(source);
}

function sourceSpan(source: string): SourceSpan | null {
  const match = SOURCE_LINES.exec(source);
  if (match === null) return null;
  const first = Number(match[1]);
  return match[2] === undefined ? { first, last: first, context: LINE_CONTEXT } : { first, last: Number(match[2]), context: 0 };
}

function windowOf(span: SourceSpan, lineCount: number): Window | null {
  if (span.first > lineCount) return null;
  return { from: Math.max(1, span.first - span.context), to: Math.min(lineCount, span.last + span.context) };
}

function parseAnchor(anchor: string): (Window & { hash: string }) | null {
  const match = ANCHOR_FORMAT.exec(anchor);
  return match === null ? null : { hash: match[1] ?? "", from: Number(match[2]), to: Number(match[3]) };
}

function fileLines(text: string): string[] {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function significantChars(lines: readonly string[]): number {
  return lines.join("").replace(/\s/g, "").length;
}

function hashLines(lines: readonly string[]): string {
  const fragment = lines.map((line) => line.trimEnd()).join("\n");
  return createHash("sha1").update(fragment).digest("hex").slice(0, HASH_LENGTH);
}
