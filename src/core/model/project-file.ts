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

const REPOS_KEY = /^\s*repos\s*:(.*)$/;
const LIST_ITEM = /^\s*-\s+(.*)$/;
const TRAILING_COMMENT = /\s+#.*$/;
const ENCLOSING_BRACKETS = /^[\s[]+|[\s\]]+$/g;
const QUOTED = /^(["'])(.*)\1$/;

export function reposOfUnparsed(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const keyAt = lines.findIndex((line) => REPOS_KEY.test(line));
  if (keyAt === -1) return [];
  const inline = (REPOS_KEY.exec(lines[keyAt] ?? "")?.[1] ?? "").replace(TRAILING_COMMENT, "");
  const items = inline.trim() === "" ? listItemsAfter(lines.slice(keyAt + 1)) : inline.split(",");
  return items.map(plainRepoItem).filter((item) => item !== "");
}

function listItemsAfter(lines: readonly string[]): string[] {
  const end = lines.findIndex((line) => !LIST_ITEM.test(line));
  return (end === -1 ? lines : lines.slice(0, end)).map((line) => LIST_ITEM.exec(line)?.[1] ?? "");
}

function plainRepoItem(item: string): string {
  return item.replace(TRAILING_COMMENT, "").replace(ENCLOSING_BRACKETS, "").replace(QUOTED, "$2");
}
