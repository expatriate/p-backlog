import { describe, expect, it } from "vitest";
import { parseProjectFile, claimedReposOf, serializeProject } from "./project-file";

const location = { id: "spa", path: "/backlog/spa/project.md" };

describe("project-file", () => {
  it("разбирает project.md и записывает его обратно без потерь", () => {
    const text = "---\nname: spa\nprefix: SPA\nrepos: [~/projects/spa]\ncolor: green\n---\n\nОписание.\n";
    const parsed = parseProjectFile(text, location);
    expect(parsed).toEqual({
      ok: true,
      value: { name: "spa", prefix: "SPA", repos: ["~/projects/spa"], active: true, extra: { color: "green" }, body: "Описание.\n", ...location },
    });
    if (!parsed.ok) return;
    expect(serializeProject(parsed.value)).toBe(text);
  });

  it("хранит номер последней удалённой задачи после repos", () => {
    const text = "---\nname: spa\nprefix: SPA\nrepos: []\nissuedUpTo: 14\n---\n";
    const parsed = parseProjectFile(text, location);
    expect(parsed).toMatchObject({ ok: true, value: { issuedUpTo: 14 } });
    if (!parsed.ok) return;
    expect(serializeProject(parsed.value)).toBe(text);
  });

  it("активность по умолчанию включена, в файл пишется только выключенная", () => {
    const parsed = parseProjectFile("---\nname: spa\nprefix: SPA\n---\n", location);
    expect(parsed).toMatchObject({ ok: true, value: { active: true } });
    if (!parsed.ok) return;

    expect(serializeProject(parsed.value)).not.toContain("active");
    const off = serializeProject({ ...parsed.value, active: false });
    expect(off).toContain("active: false");
    expect(parseProjectFile(off, location)).toMatchObject({ ok: true, value: { active: false } });
  });

  it("отклоняет некорректный префикс", () => {
    expect(parseProjectFile("---\nname: spa\nprefix: spa\n---\n", location).ok).toBe(false);
  });
});

describe("claimedReposOf — repos, заявленные сломанным project.md", () => {
  it.each([
    ["блочный список с комментарием", "---\nrepos:\n  - ~/projects/spa  # основной\n  - '/srv/My Repo'\nname: x\n", ["~/projects/spa", "/srv/My Repo"]],
    ["незакрытый строчный список с пробелами в пути", '---\nrepos: [~/My Projects/app, "~/b"\n  bad\n', ["~/My Projects/app", "~/b"]],
    ["одно значение с комментарием", "repos: ~/projects # где лежит\n", ["~/projects"]],
    ["пути в тексте и других полях — не repos", "---\nname: см. ~/projects\n---\nСоседи лежат в ~/projects, file:///home\n", []],
  ])("%s", (_case, text, repos) => {
    expect(claimedReposOf(text)).toEqual(repos);
  });
});
