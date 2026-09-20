import { parseFrontmatter, stringifyFrontmatter } from "./frontmatter";
import { projectFrontmatterSchema, type ParseResult, type Project } from "./types";

export type ProjectLocation = { id: string; path: string };

export type ProjectContent = Pick<Project, "name" | "prefix" | "repos" | "issuedUpTo" | "active" | "extra" | "body">;

export function parseProjectFile(text: string, location: ProjectLocation): ParseResult<Project> {
  const parsed = parseFrontmatter(text, projectFrontmatterSchema);
  if (!parsed.ok) return parsed;
  const { data, extra, body } = parsed.value;
  return { ok: true, value: { ...data, extra, body, ...location } };
}

export function serializeProject(project: ProjectContent): string {
  const { name, prefix, repos, issuedUpTo, active } = project;
  return stringifyFrontmatter({ name, prefix, repos, issuedUpTo, active: active ? undefined : false, ...project.extra }, project.body);
}
