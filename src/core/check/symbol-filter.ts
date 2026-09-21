import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CodeGraph, GraphSymbol } from "../graph/code-graph";
import type { Task } from "../model/types";
import { sourceRange, type LineRange } from "./anchor";
import { reviewMark, sourcePath, type Candidate, type SymbolOf } from "./candidates";
import { changedLines } from "./repo-facts";

export type SymbolLookup = (task: Task) => GraphSymbol | null;

export function symbolLookup(repo: string, graph: CodeGraph | null): SymbolLookup {
  if (graph === null) return () => null;
  const known = new Map<string, GraphSymbol | null>();
  return (task) => {
    const cached = known.get(task.id);
    if (cached !== undefined) return cached;
    const symbol = lookUp(repo, graph, task);
    known.set(task.id, symbol);
    return symbol;
  };
}

export function symbolNames(symbolOf: SymbolLookup): SymbolOf {
  return (task) => {
    const symbol = symbolOf(task);
    return symbol === null || task.source === undefined ? null : `${sourcePath(task.source)}::${symbol.name}`;
  };
}

export async function filterBySymbol(candidates: readonly Candidate[], tasks: readonly Task[], repo: string, symbolOf: SymbolLookup): Promise<Candidate[]> {
  const decided = await Promise.all(candidates.map((candidate) => decide(candidate, tasks, repo, symbolOf)));
  return decided.filter((candidate) => candidate !== null);
}

function lookUp(repo: string, graph: CodeGraph, task: Task): GraphSymbol | null {
  const range = sourceRange(task.source);
  if (task.source === undefined || range === null) return null;
  const path = sourcePath(task.source);
  const hash = fileHash(join(repo, path));
  return hash === null ? null : graph.symbolAt(path, range.from, hash);
}

async function decide(candidate: Candidate, tasks: readonly Task[], repo: string, symbolOf: SymbolLookup): Promise<Candidate | null> {
  if (candidate.kind !== "source-changed") return candidate;
  const task = tasks.find((item) => item.id === candidate.task.id);
  if (task === undefined) return candidate;
  const symbol = symbolOf(task);
  if (symbol === null) return candidate;
  const ranges = await changedLines(repo, candidate.path, new Date(reviewMark(task)));
  if (ranges === null) return candidate;
  const watched = watchedRange(symbol, sourceRange(task.source));
  return ranges.some((range) => overlaps(range, watched)) ? { ...candidate, bySymbol: true } : null;
}

function watchedRange(symbol: GraphSymbol, declared: LineRange | null): LineRange {
  if (declared === null) return symbol;
  return { from: Math.min(symbol.from, declared.from), to: Math.max(symbol.to, declared.to) };
}

function fileHash(path: string): string | null {
  try {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  } catch {
    return null;
  }
}

function overlaps(range: LineRange, watched: LineRange): boolean {
  return range.from <= watched.to && range.to >= watched.from;
}
