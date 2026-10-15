import { createHash } from "node:crypto";
import { SOURCE_LINES } from "../model/source";

type SourceSpan = { first: number; last: number; context: number; isRange: boolean };
const LINE_CONTEXT = 2;
const SNIPPET_CONTEXT = 5;
const HASH_LENGTH = 12;
const LINE_NUMBER_WIDTH = 5;
const MIN_MOVABLE_CHARS = 24;
const ANCHOR_FORMAT = /^([0-9a-f]+)@(\d+)-(\d+)(?:\/([0-9a-f]+))?$/;

export function anchorOf(text: string, source: string): string | null {
  const span = sourceSpan(source);
  const lines = fileLines(text);
  const window = span === null ? null : windowOf(span, lines.length);
  if (span === null || window === null) return null;
  return `${hashLines(lines.slice(window.from - 1, window.to))}@${window.from}-${window.to}/${hashLines(lines.slice(span.first - 1, span.last))}`;
}

export function windowMatches(text: string, source: string, anchor: string): boolean {
  const current = anchorOf(text, source);
  const expected = parseAnchor(anchor);
  const found = current === null ? null : parseAnchor(current);
  return expected !== null && found !== null && found.hash === expected.hash && found.from === expected.from && found.to === expected.to;
}

export type LineRange = { from: number; to: number };

export function sourceRange(source: string | undefined): LineRange | null {
  const span = source === undefined ? null : sourceSpan(source);
  return span === null ? null : { from: span.first, to: span.last };
}

export function anchorRange(source: string): LineRange | null {
  const span = sourceSpan(source);
  return span === null ? null : withContext(span);
}

export function locateAnchor(text: string, source: string, anchor: string): string | null {
  return windowMatches(text, source, anchor) ? source : findMoved(text, source, anchor);
}

export function isAnchorFor(anchor: string, source: string): boolean {
  const parsed = parseAnchor(anchor);
  const span = sourceSpan(source);
  if (parsed === null || span === null) return false;
  const { from, to } = withContext(span);
  return parsed.from === from && parsed.to >= span.first && parsed.to <= to;
}

export function findMoved(text: string, source: string, anchor: string): string | null {
  const parsed = parseAnchor(anchor);
  const span = sourceSpan(source);
  if (parsed === null || span === null) return null;
  const start = uniqueBlockStart(fileLines(text), parsed.to - parsed.from + 1, parsed.hash);
  if (start === null) return null;
  const shift = start - parsed.from;
  return withLines(source, span.first + shift, span.isRange ? span.last + shift : undefined);
}

export function findIntactLines(text: string, source: string, anchor: string): string | null {
  const linesHash = parseAnchor(anchor)?.linesHash;
  const span = sourceSpan(source);
  if (linesHash === undefined || span === null) return null;
  const length = span.last - span.first + 1;
  const start = uniqueBlockStart(fileLines(text), length, linesHash);
  return start === null ? null : withLines(source, start, span.isRange ? start + length - 1 : undefined);
}

function uniqueBlockStart(lines: readonly string[], length: number, hash: string): number | null {
  const starts: number[] = [];
  for (let start = 1; start + length - 1 <= lines.length; start++) {
    if (hashLines(lines.slice(start - 1, start - 1 + length)) === hash) starts.push(start);
  }
  const [start] = starts;
  if (starts.length !== 1 || start === undefined) return null;
  return significantChars(lines.slice(start - 1, start - 1 + length)) < MIN_MOVABLE_CHARS ? null : start;
}

export function remappedSource(source: string, lineAt: (line: number) => number): string | null {
  const span = sourceSpan(source);
  return span === null ? null : withLines(source, lineAt(span.first), span.isRange ? lineAt(span.last) : undefined);
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

function withLines(source: string, first: number, last?: number): string {
  return `${source.replace(SOURCE_LINES, "")}:${last === undefined ? first : `${first}-${last}`}`;
}

function sourceSpan(source: string): SourceSpan | null {
  const match = SOURCE_LINES.exec(source);
  if (match === null) return null;
  const first = Number(match[1]);
  return match[2] === undefined ? { first, last: first, context: LINE_CONTEXT, isRange: false } : { first, last: Number(match[2]), context: 0, isRange: true };
}

function windowOf(span: SourceSpan, lineCount: number): LineRange | null {
  if (span.first > lineCount) return null;
  const { from, to } = withContext(span);
  return { from, to: Math.min(lineCount, to) };
}

function withContext(span: SourceSpan): LineRange {
  return { from: Math.max(1, span.first - span.context), to: span.last + span.context };
}

function parseAnchor(anchor: string): (LineRange & { hash: string; linesHash: string | undefined }) | null {
  const match = ANCHOR_FORMAT.exec(anchor);
  return match === null ? null : { hash: match[1] ?? "", from: Number(match[2]), to: Number(match[3]), linesHash: match[4] };
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
