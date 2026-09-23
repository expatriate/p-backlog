import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cliMessages } from "../src/cli/messages.ts";
import { resolveBacklogRoot } from "../src/core/store/paths.ts";
import { settledLanguage } from "../src/core/store/settings.ts";
import { defaultSkillsDir, linkSkillFor, skillSourceDir } from "../src/cli/skill-link.ts";

const STOP_HOOK_COMMAND = "command -v backlog >/dev/null && backlog hook stop || true";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const home = homedir();
const skillsDir = process.env.CLAUDE_SKILLS_DIR ?? defaultSkillsDir(home);
const settingsPath = process.env.CLAUDE_SETTINGS_PATH ?? join(home, ".claude/settings.json");
const backlogRoot = resolveBacklogRoot(process.env, home);
const { language } = await settledLanguage(backlogRoot, process.env);
const cli = cliMessages(language);

if (await linkSkill()) await addStopHook();

async function linkSkill() {
  const target = join(skillsDir, "backlog");
  const source = skillSourceDir(repoRoot, language);
  try {
    const result = await linkSkillFor(language, { skillsDir, repoRoot });
    if (result === "linked") {
      console.log(cli.installSkillLinked(target, source));
      return true;
    }
    if (result === "kept") {
      console.log(cli.installSkillKept(target));
      return true;
    }
    console.error(cli.installSkillForeign(target, source));
    process.exitCode = 1;
    return false;
  } catch (error) {
    console.error(cli.installSkillLinkFailed(target, error.code ?? error.message));
    process.exitCode = 1;
    return false;
  }
}

async function addStopHook() {
  const text = await readSettings();
  if (text === null) return;
  const settings = parseSettings(text);
  if (settings === null) return;
  settings.hooks ??= {};
  if (!Array.isArray(settings.hooks.Stop)) settings.hooks.Stop = [];
  const installed = settings.hooks.Stop.some((group) => group.hooks?.some((hook) => hook.command === STOP_HOOK_COMMAND));
  if (installed) {
    console.log(cli.installHookExists(settingsPath));
    return;
  }
  settings.hooks.Stop.push({ hooks: [{ type: "command", command: STOP_HOOK_COMMAND }] });
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  console.log(cli.installHookAdded(settingsPath));
}

async function readSettings() {
  try {
    return await readFile(settingsPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "{}";
    console.error(cli.installSettingsUnreadable(settingsPath, error.code ?? error.message));
    process.exitCode = 1;
    return null;
  }
}

function parseSettings(text) {
  let settings;
  try {
    settings = JSON.parse(text);
  } catch {
    settings = undefined;
  }
  if (typeof settings !== "object" || settings === null || Array.isArray(settings)) {
    console.error(cli.installSettingsInvalid(settingsPath));
    process.exitCode = 1;
    return null;
  }
  return settings;
}
