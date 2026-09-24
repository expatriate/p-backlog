import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { claudeDir, claudeProjectsDir, claudeSettingsPath, claudeSkillsDir } from "./claude-dir";

describe("каталог Claude Code", () => {
  it("CLAUDE_CONFIG_DIR переносит скиллы, настройки и расшифровки, отдельные переменные главнее", () => {
    const env = { CLAUDE_CONFIG_DIR: "/cfg" };
    expect(claudeDir({}, "/home/u")).toBe(join("/home/u", ".claude"));
    expect(claudeSkillsDir(env, "/home/u")).toBe(join("/cfg", "skills"));
    expect(claudeSettingsPath(env, "/home/u")).toBe(join("/cfg", "settings.json"));
    expect(claudeProjectsDir(env, "/home/u")).toBe(join("/cfg", "projects"));
    expect(claudeSkillsDir({ ...env, CLAUDE_SKILLS_DIR: "/s" }, "/home/u")).toBe("/s");
  });
});
