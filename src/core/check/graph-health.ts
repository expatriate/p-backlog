import { join } from "node:path";
import { hasCodeGraph, openCodeGraph, type CodeGraph } from "../graph/code-graph";
import type { Project, Task } from "../model/types";
import { sourceRange } from "./anchor";
import { isReviewable, sourcePath } from "./candidates";
import { findRepo } from "./project-repo";
import { fileHash, symbolLookup } from "./symbol-filter";

export type GraphState = "none" | "unreadable" | "stale" | "fresh";

export type GraphHealth = { state: GraphState; pinned: number; resolved: number };

export async function projectGraphHealth(project: Project, tasks: readonly Task[], home: string): Promise<GraphHealth> {
  return graphHealth(await findRepo(project, home), tasks.filter((task) => task.projectId === project.id));
}

export function graphHealth(repo: string | undefined, tasks: readonly Task[]): GraphHealth {
  const pinned = tasks.filter((task) => isReviewable(task) && sourceRange(task.source) !== null);
  const unusable = (state: GraphState): GraphHealth => ({ state, pinned: pinned.length, resolved: 0 });
  if (repo === undefined || !hasCodeGraph(repo)) return unusable("none");
  const graph = openCodeGraph(repo);
  if (graph === null) return unusable("unreadable");
  try {
    const symbolOf = symbolLookup(repo, graph);
    const resolved = pinned.filter((task) => symbolOf(task) !== null).length;
    return { state: isStale(repo, graph, pinned) ? "stale" : "fresh", pinned: pinned.length, resolved };
  } finally {
    graph.close();
  }
}

function isStale(repo: string, graph: CodeGraph, pinned: readonly Task[]): boolean {
  const paths = [...new Set(pinned.flatMap((task) => (task.source === undefined ? [] : [sourcePath(task.source)])))];
  const states = paths.map((path) => {
    const hash = fileHash(join(repo, path));
    return hash === null ? "absent" : graph.fileState(path, hash);
  });
  const count = (state: string) => states.filter((candidate) => candidate === state).length;
  return count("changed") > count("fresh");
}
