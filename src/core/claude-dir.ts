import { join } from "node:path";

export function claudeDir(env: NodeJS.ProcessEnv, home: string): string {
  return env.CLAUDE_CONFIG_DIR || join(home, ".claude");
}

export function claudeSkillsDir(env: NodeJS.ProcessEnv, home: string): string {
  return env.CLAUDE_SKILLS_DIR || join(claudeDir(env, home), "skills");
}

export function claudeSettingsPath(env: NodeJS.ProcessEnv, home: string): string {
  return env.CLAUDE_SETTINGS_PATH || join(claudeDir(env, home), "settings.json");
}

export function claudeProjectsDir(env: NodeJS.ProcessEnv, home: string): string {
  return join(claudeDir(env, home), "projects");
}
