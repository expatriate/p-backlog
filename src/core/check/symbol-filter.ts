import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CodeGraph, GraphSymbol } from "../graph/code-graph";
import type { Task } from "../model/types";
import { sourceLine } from "./anchor";
import { reviewMark, sourcePath, type Candidate, type SymbolOf } from "./candidates";
import { changedLines, type LineRange } from "./repo-facts";

export async function filterBySymbol(candidates: readonly Candidate[], tasks: readonly Task[], repo: string, graph: CodeGraph | null): Promise<Candidate[]> {
  if (graph === null) return [...candidates];
  const symbolOf = symbolLookup(repo, graph);
  const decided = await Promise.all(candidates.map((candidate) => decide(candidate, tasks, repo, symbolOf)));
  return decided.filter((candidate) => candidate !== null);
}

export function symbolNames(repo: string, graph: CodeGraph | null): SymbolOf {
  if (graph === null) return () => null;
  const symbolOf = symbolLookup(repo, graph);
  return (task) => {
    const symbol = symbolOf(task);
    return symbol === null || task.source === undefined ? null : `${sourcePath(task.source)}::${symbol.name}`;
  };
}

function symbolLookup(repo: string, graph: CodeGraph): (task: Task) => GraphSymbol | null {
  const known = new Map<string, GraphSymbol | null>();
  return (task) => {
    const cached = known.get(task.id);
    if (cached !== undefined) return cached;
    const symbol = lookUp(repo, graph, task);
    known.set(task.id, symbol);
    return symbol;
  };
}

function lookUp(repo: string, graph: CodeGraph, task: Task): GraphSymbol | null {
  const line = sourceLine(task.source);
  if (task.source === undefined || line === null) return null;
  const path = sourcePath(task.source);
  const hash = fileHash(join(repo, path));
  return hash === null ? null : graph.symbolAt(path, line, hash);
}

async function decide(candidate: Candidate, tasks: readonly Task[], repo: string, symbolOf: (task: Task) => GraphSymbol | null): Promise<Candidate | null> {
  if (candidate.kind !== "source-changed") return candidate;
  const task = tasks.find((item) => item.id === candidate.task.id);
  if (task === undefined) return candidate;
  const symbol = symbolOf(task);
  if (symbol === null) return candidate;
  const ranges = await changedLines(repo, candidate.path, new Date(reviewMark(task)));
  if (ranges === null) return candidate;
  return ranges.some((range) => overlaps(range, symbol)) ? { ...candidate, bySymbol: true } : null;
}

function fileHash(path: string): string | null {
  try {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  } catch {
    return null;
  }
}

function overlaps(range: LineRange, symbol: LineRange): boolean {
  return range.from <= symbol.to && range.to >= symbol.from;
}
