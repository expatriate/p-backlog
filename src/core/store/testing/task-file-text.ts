export function taskFile(id: string, fields: string | Record<string, string> = "", body = ""): string {
  const overrides = typeof fields === "string" ? {} : fields;
  const rawLines = typeof fields === "string" ? fields : "";
  const frontmatter = { id, title: `Задача ${id}`, created: "2026-09-17T10:00:00+03:00", ...overrides };
  const lines = Object.entries(frontmatter).map(([key, value]) => `${key}: ${value}\n`);
  return `---\n${lines.join("")}${rawLines}---\n${body === "" ? "" : `\n${body}\n`}`;
}
