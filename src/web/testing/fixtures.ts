export function taskFixture(id: string, fields: Record<string, string> = {}, body = ""): string {
  const frontmatter = { id, title: `Задача ${id}`, created: "2026-09-17T10:00:00+03:00", ...fields };
  const lines = Object.entries(frontmatter).map(([key, value]) => `${key}: ${value}`);
  return `---\n${lines.join("\n")}\n---\n${body === "" ? "" : `\n${body}\n`}`;
}
