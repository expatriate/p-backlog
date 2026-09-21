import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CodeGraph } from "../graph/code-graph";
import type { Task } from "../model/types";
import { SOURCE_LINES } from "./anchor";
import { reviewMark, type Candidate } from "./candidates";
import { changedLines, type LineRange } from "./repo-facts";

export async function filterBySymbol(candidates: readonly Candidate[], tasks: readonly Task[], repo: string, graph: CodeGraph | null): Promise<Candidate[]> {
  if (graph === null) return [...candidates];
  const decided = await Promise.all(candidates.map((candidate) => decide(candidate, tasks, repo, graph)));
  return decided.filter((candidate) => candidate !== null);
}

export function sourceLine(source: string | undefined): number | null {
  const match = source === undefined ? null : SOURCE_LINES.exec(source);
  return match === null || match[1] === undefined ? null : Number(match[1]);
}

export function fileHashSync(path: string): string | null {
  try {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  } catch {
    return null;
  }
}

async function decide(candidate: Candidate, tasks: readonly Task[], repo: string, graph: CodeGraph): Promise<Candidate | null> {
  if (candidate.kind !== "source-changed") return candidate;
  const task = tasks.find((item) => item.id === candidate.task.id);
  const line = sourceLine(task?.source);
  if (task === undefined || line === null) return candidate;
  const hash = await fileHash(join(repo, candidate.path));
  const symbol = hash === null ? null : graph.symbolAt(candidate.path, line, hash);
  if (symbol === null) return candidate;
  const ranges = await changedLines(repo, candidate.path, new Date(reviewMark(task)));
  if (ranges === null) return candidate;
  return ranges.some((range) => overlaps(range, symbol)) ? { ...candidate, bySymbol: true } : null;
}

async function fileHash(path: string): Promise<string | null> {
  try {
    return createHash("sha256").update(await readFile(path)).digest("hex");
  } catch {
    return null;
  }
}

function overlaps(range: LineRange, symbol: { from: number; to: number }): boolean {
  return range.from <= symbol.to && range.to >= symbol.from;
}
