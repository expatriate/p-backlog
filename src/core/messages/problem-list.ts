import type { Problem } from "../model/problems";

export function problemList(problem: (problem: Problem) => string): (list: readonly Problem[]) => string {
  return (list) => [...new Set(list.map(problem))].join("; ");
}
