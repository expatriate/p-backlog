import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CodeGraph, GraphSymbol } from "../graph/code-graph";
import type { FilteredSighting } from "../journal/events";
import type { Task } from "../model/types";
import { sourceRange, type LineRange } from "./anchor";
import { reviewMark, sourcePath, type Candidate, type SymbolOf } from "./candidates";
import type { CurrentSources } from "./current-source";
import type { DiffSince } from "./repo-facts";

export type SymbolLookup = (path: string, line: number) => GraphSymbol | null;

export function symbolLookup(repo: string, graph: CodeGraph | null): SymbolLookup {
  if (graph === null) return () => null;
  const hashes = new Map<string, string | null>();
  const known = new Map<string, GraphSymbol | null>();
  return (path, line) => {
    const key = `${line}:${path}`;
    const cached = known.get(key);
    if (cached !== undefined) return cached;
    if (!hashes.has(path)) hashes.set(path, fileHash(join(repo, path)));
    const hash = hashes.get(path) ?? null;
    const symbol = hash === null ? null : graph.symbolAt(path, line, hash);
    known.set(key, symbol);
    return symbol;
  };
}

export function symbolNames(symbolAt: SymbolLookup, located: CurrentSources): SymbolOf {
  return (task) => {
    const found = symbolOfSource(symbolAt, located.get(task.id));
    return found?.symbol.qualifiedName ?? null;
  };
}

export function symbolOfSource(symbolAt: SymbolLookup, source: string | null | undefined): { symbol: GraphSymbol; declared: LineRange } | null {
  const declared = sourceRange(source ?? undefined);
  if (source === null || source === undefined || declared === null) return null;
  const symbol = symbolAt(sourcePath(source), declared.from);
  return symbol === null ? null : { symbol, declared };
}

export type SymbolFilterResult = { kept: Candidate[]; filtered: FilteredSighting[] };

type Decision = { kept: Candidate } | { filtered: FilteredSighting };

type SymbolFilterContext = { tasksById: ReadonlyMap<string, Task>; located: CurrentSources; diffOf: DiffSince; symbolAt: SymbolLookup };

export async function filterBySymbol(candidates: readonly Candidate[], context: SymbolFilterContext): Promise<SymbolFilterResult> {
  const decisions = await Promise.all(candidates.map((candidate) => decide(candidate, context)));
  return {
    kept: decisions.flatMap((decision) => ("kept" in decision ? [decision.kept] : [])),
    filtered: decisions.flatMap((decision) => ("filtered" in decision ? [decision.filtered] : [])),
  };
}

async function decide(candidate: Candidate, { tasksById, located, diffOf, symbolAt }: SymbolFilterContext): Promise<Decision> {
  if (candidate.kind !== "source-changed") return { kept: candidate };
  const task = tasksById.get(candidate.task.id);
  if (task === undefined) return { kept: candidate };
  const found = symbolOfSource(symbolAt, located.get(task.id));
  if (found === null) return { kept: candidate };
  const diff = await diffOf(candidate.path, new Date(reviewMark(task)));
  if (diff === null) return { kept: candidate };
  const watched = watchedRange(found.symbol, found.declared);
  if (diff.changed.some((range) => overlaps(range, watched))) return { kept: { ...candidate, bySymbol: true } };
  return { filtered: { task: task.id, symbol: shortName(found.symbol.qualifiedName) } };
}

function shortName(qualifiedName: string): string {
  return qualifiedName.slice(qualifiedName.lastIndexOf("::") + 2);
}

function watchedRange(symbol: GraphSymbol, declared: LineRange): LineRange {
  return { from: Math.min(symbol.from, declared.from), to: Math.max(symbol.to, declared.to) };
}

export function fileHash(path: string): string | null {
  try {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  } catch {
    return null;
  }
}

function overlaps(range: LineRange, watched: LineRange): boolean {
  return range.from <= watched.to && range.to >= watched.from;
}
