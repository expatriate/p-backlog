import type { LineRange } from "./anchor";

export type Hunk = { oldFirst: number; oldCount: number; newFirst: number; newCount: number; lines: readonly string[] };

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const FILE_HEADER = "diff ";

export function parseHunks(diff: string): Hunk[] | null {
  const hunks: Hunk[] = [];
  let lines: string[] | null = null;
  for (const line of diff.split("\n")) {
    const header = HUNK_HEADER.exec(line);
    if (header !== null) {
      lines = [];
      hunks.push(hunkOf(header, lines));
    } else if (line.startsWith(FILE_HEADER)) {
      lines = null;
    } else if (lines !== null && /^[-+ \\]/.test(line)) {
      lines.push(line);
    }
  }
  const unparsed = hunks.length === 0 && diff.trim() !== "";
  const createdFile = hunks.some((hunk) => hunk.oldFirst === 0);
  return unparsed || createdFile ? null : hunks;
}

function hunkOf(header: RegExpExecArray, lines: string[]): Hunk {
  const oldCount = Number(header[2] ?? 1);
  const newCount = Number(header[4] ?? 1);
  const oldStart = Number(header[1]);
  const newStart = Number(header[3]);
  return {
    oldFirst: oldCount === 0 && oldStart > 0 ? oldStart + 1 : oldStart,
    oldCount,
    newFirst: newCount === 0 ? newStart + 1 : newStart,
    newCount,
    lines,
  };
}

export function changedRanges(hunks: readonly Hunk[]): LineRange[] {
  const ranges: LineRange[] = [];
  for (const hunk of hunks) {
    let nextLine = hunk.newFirst;
    let run: ChangeRun | null = null;
    for (const line of hunk.lines) {
      if (run !== null && line.startsWith(" ")) {
        ranges.push(run.range);
        run = null;
      }
      if (line.startsWith("+")) {
        run = withAddedLine(run, nextLine);
        nextLine++;
      } else if (line.startsWith("-")) {
        run ??= { range: { from: nextLine - 1, to: nextLine }, added: false };
      } else if (line.startsWith(" ")) {
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
  for (const line of hunk.lines) {
    if (line.startsWith("+")) {
      newAt++;
    } else if (line.startsWith("-") || line.startsWith(" ")) {
      if (oldAt === oldLine) return newAt;
      oldAt++;
      if (line.startsWith(" ")) newAt++;
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
    for (const line of hunk.lines) {
      if (line.startsWith(" ") || line.startsWith("-")) base.push(line.slice(1));
      if (line.startsWith(" ") || line.startsWith("+")) next++;
    }
  }
  base.push(...current.slice(next - 1));
  return base.join("\n");
}
