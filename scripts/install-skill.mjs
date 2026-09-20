import { lstat, mkdir, readFile, readlink, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const STOP_HOOK_COMMAND = "command -v backlog >/dev/null && backlog hook stop || true";

const source = resolve(dirname(fileURLToPath(import.meta.url)), "../skill/backlog");
const skillsDir = process.env.CLAUDE_SKILLS_DIR ?? join(homedir(), ".claude/skills");
const settingsPath = process.env.CLAUDE_SETTINGS_PATH ?? join(homedir(), ".claude/settings.json");

if (await linkSkill()) await addStopHook();

async function linkSkill() {
  const target = join(skillsDir, "backlog");
  const existing = await lstat(target).catch(() => null);
  if (existing === null) {
    try {
      await mkdir(skillsDir, { recursive: true });
      await symlink(source, target, "dir");
    } catch (error) {
      console.error(`Не удалось создать ссылку ${target} (${error.code ?? error.message}).`);
      process.exitCode = 1;
      return false;
    }
    console.log(`Скилл установлен: ${target} → ${source}`);
    return true;
  }
  if (existing.isSymbolicLink() && resolve(skillsDir, await readlink(target)) === source) {
    console.log(`Скилл уже установлен: ${target}`);
    return true;
  }
  console.error(`${target} уже существует и не ведёт в ${source}. Уберите его вручную и повторите.`);
  process.exitCode = 1;
  return false;
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
    console.log(`Хук Stop уже есть в ${settingsPath}`);
    return;
  }
  settings.hooks.Stop.push({ hooks: [{ type: "command", command: STOP_HOOK_COMMAND }] });
  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  console.log(`Хук Stop добавлен в ${settingsPath}`);
}

async function readSettings() {
  try {
    return await readFile(settingsPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "{}";
    console.error(`${settingsPath} не прочитать (${error.code ?? error.message}), хук Stop не добавлен.`);
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
    console.error(`${settingsPath} — не объект JSON, хук Stop не добавлен. Исправьте файл и повторите.`);
    process.exitCode = 1;
    return null;
  }
  return settings;
}
