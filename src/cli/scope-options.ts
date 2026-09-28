import type { Project } from "../core/model/types";
import type { LoadedBacklog } from "../core/store/load";
import { UsageError, type CliIo } from "./io";
import { findProjectOrWarn } from "./lookups";
import { cliMessages } from "./messages";

export const SCOPE_OPTIONS = {
  project: { type: "string" },
  "all-projects": { type: "boolean", default: false },
} as const;

type ScopeValues = { project?: string; "all-projects"?: boolean };

type Scope = { projectIds: string[]; activeIds: string[]; project?: Project };

export function resolveScope(loaded: LoadedBacklog, io: CliIo, values: ScopeValues): Scope | null {
  if (values.project !== undefined && values["all-projects"] === true) throw new UsageError(cliMessages(io.language).needProjectOrAllProjects);
  if (values["all-projects"] === true) {
    const projectIds = loaded.projects.map((project) => project.id);
    return { projectIds, activeIds: loaded.projects.filter((project) => project.active).map((project) => project.id) };
  }
  const project = findProjectOrWarn(loaded, io, values.project);
  return project === undefined ? null : { projectIds: [project.id], activeIds: [project.id], project };
}
