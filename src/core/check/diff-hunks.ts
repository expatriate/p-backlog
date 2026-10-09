import type { LineRange } from "./anchor";

type HunkLine = { kind: "added" | "removed" | "context"; text: string };

export type Hunk = { oldFirst: number; oldCount: number; newFirst: number; newCount: number; lines: readonly HunkLine[] };

export type HunkHeader = { oldStart: number; oldCount: number; newStart: number; newCount: number };

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const OMITTED_COUNT = 1;
export const FILE_HEADER = "diff ";
const EMPTY_OLD_SIDE = 0;

export function hunkHeaderOf(line: string): HunkHeader | null {
  const header = HUNK_HEADER.exec(line);
  if (header === null) return null;
  const [, oldStart, oldCount, newStart, newCount] = header;
  return { oldStart: Number(oldStart), oldCount: Number(oldCount ?? OMITTED_COUNT), newStart: Number(newStart), newCount: Number(newCount ?? OMITTED_COUNT) };
}

export function firstLineOf(start: number, count: number): number {
  // A hunk side with no lines names the line before it: `-5,0` inserts after line 5.
  return count === 0 ? start + 1 : start;
}

export function parseHunks(diff: string): Hunk[] | null {
  const hunks: Hunk[] = [];
  let lines: HunkLine[] | null = null;
  for (const line of diff.split("\n")) {
    const header = hunkHeaderOf(line);
    if (header?.oldStart === EMPTY_OLD_SIDE) return null;
    if (header !== null) {
      lines = [];
      hunks.push(hunkOf(header, lines));
    } else if (line.startsWith(FILE_HEADER)) {
      lines = null;
    } else if (lines !== null) {
      const hunkLine = hunkLineOf(line);
      if (hunkLine !== null) lines.push(hunkLine);
    }
  }
  const unparsed = hunks.length === 0 && diff.trim() !== "";
  return unparsed ? null : hunks;
}

function hunkOf({ oldStart, oldCount, newStart, newCount }: HunkHeader, lines: HunkLine[]): Hunk {
  return { oldFirst: firstLineOf(oldStart, oldCount), oldCount, newFirst: firstLineOf(newStart, newCount), newCount, lines };
}

function hunkLineOf(line: string): HunkLine | null {
  const text = line.slice(1);
  switch (line[0]) {
    case "+":
      return { kind: "added", text };
    case "-":
      return { kind: "removed", text };
    case " ":
      return { kind: "context", text };
    case undefined:
    default:
      return null;
  }
}

export function changedRanges(hunks: readonly Hunk[]): LineRange[] {
  const ranges: LineRange[] = [];
  for (const hunk of hunks) {
    let nextLine = hunk.newFirst;
    let run: ChangeRun | null = null;
    for (const { kind } of hunk.lines) {
      if (run !== null && kind === "context") {
        ranges.push(run.range);
        run = null;
      }
      if (kind === "added") {
        run = withAddedLine(run, nextLine);
        nextLine++;
      } else if (kind === "removed") {
        run ??= { range: { from: nextLine - 1, to: nextLine }, added: false };
      } else if (kind === "context") {
        nextLine++;
      }
    }
    if (run !== null) ranges.push(run.range);
  }
  return ranges;
}

type ChangeRun = { range: LineRange; added: boolean };

function withAddedLine(run: ChangeRun | null, line: number): ChangeRun {
  return { range: { from: run?.added === true ? run.range.from : line, to: line }, added: true };
}

export function modifiesLines(hunks: readonly Hunk[], lines: LineRange): boolean {
  return hunks.some((hunk) => {
    let oldLine = hunk.oldFirst;
    for (const { kind } of hunk.lines) {
      if (kind === "removed") {
        if (oldLine >= lines.from && oldLine <= lines.to) return true;
        oldLine++;
      } else if (kind === "added") {
        if (oldLine > lines.from && oldLine <= lines.to) return true;
      } else if (kind === "context") {
        oldLine++;
      }
    }
    return false;
  });
}

export function currentLine(hunks: readonly Hunk[], oldLine: number): number {
  let shift = 0;
  for (const hunk of hunks) {
    if (oldLine < hunk.oldFirst) break;
    if (oldLine >= hunk.oldFirst + hunk.oldCount) {
      shift = hunk.newFirst + hunk.newCount - (hunk.oldFirst + hunk.oldCount);
      continue;
    }
    return lineInsideHunk(hunk, oldLine);
  }
  return oldLine + shift;
}

function lineInsideHunk(hunk: Hunk, oldLine: number): number {
  let oldAt = hunk.oldFirst;
  let newAt = hunk.newFirst;
  for (const { kind } of hunk.lines) {
    if (kind === "added") {
      newAt++;
    } else if (kind === "removed" || kind === "context") {
      if (oldAt === oldLine) return newAt;
      oldAt++;
      if (kind === "context") newAt++;
    }
  }
  return newAt;
}

export function baseText(hunks: readonly Hunk[], currentText: string): string {
  const current = currentText.split("\n");
  const base: string[] = [];
  let next = 1;
  for (const hunk of hunks) {
    base.push(...current.slice(next - 1, hunk.newFirst - 1));
    next = hunk.newFirst;
    for (const { kind, text } of hunk.lines) {
      if (kind === "context" || kind === "removed") base.push(text);
      if (kind === "context" || kind === "added") next++;
    }
  }
  base.push(...current.slice(next - 1));
  return base.join("\n");
}
