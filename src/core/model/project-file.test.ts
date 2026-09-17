import { describe, expect, it } from "vitest";
import { parseProjectFile, serializeProject } from "./project-file";

const location = { id: "spa", path: "/backlog/spa/project.md" };

describe("project-file", () => {
  it("разбирает project.md и записывает его обратно без потерь", () => {
    const text = "---\nname: spa\nprefix: SPA\nrepos: [~/projects/spa]\ncolor: green\n---\n\nОписание.\n";
    const parsed = parseProjectFile(text, location);
    expect(parsed).toEqual({
      ok: true,
      value: { name: "spa", prefix: "SPA", repos: ["~/projects/spa"], extra: { color: "green" }, body: "Описание.\n", ...location },
    });
    if (!parsed.ok) return;
    expect(serializeProject(parsed.value)).toBe(text);
  });

  it("отклоняет некорректный префикс", () => {
    expect(parseProjectFile("---\nname: spa\nprefix: spa\n---\n", location).ok).toBe(false);
  });
});
