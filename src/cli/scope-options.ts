import type { Project } from "../core/model/types";
import type { LoadedBacklog } from "../core/store/load";
import { UsageError, type CliIo } from "./io";
import { requireProject } from "./lookups";

export const SCOPE_OPTIONS = {
  project: { type: "string" },
  "all-projects": { type: "boolean", default: false },
} as const;

export type ScopeValues = { project?: string; "all-projects"?: boolean };

export type Scope = { projectIds: string[]; activeIds: string[]; project?: Project };

export function resolveScope(loaded: LoadedBacklog, io: CliIo, values: ScopeValues): Scope | null {
  if (values.project !== undefined && values["all-projects"] === true) throw new UsageError("Укажите либо --project, либо --all-projects");
  if (values["all-projects"] === true) {
    const projectIds = loaded.projects.map((project) => project.id);
    return { projectIds, activeIds: loaded.projects.filter((project) => project.active).map((project) => project.id) };
  }
  const project = requireProject(loaded, io, values.project);
  return project === undefined ? null : { projectIds: [project.id], activeIds: [project.id], project };
}
