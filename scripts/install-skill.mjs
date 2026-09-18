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
    await mkdir(skillsDir, { recursive: true });
    await symlink(source, target, "dir");
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
  const text = await readFile(settingsPath, "utf8").catch((error) => (error.code === "ENOENT" ? "{}" : Promise.reject(error)));
  let settings;
  try {
    settings = JSON.parse(text);
  } catch {
    console.error(`${settingsPath} — не JSON, хук Stop не добавлен. Исправьте файл и повторите.`);
    process.exitCode = 1;
    return;
  }
  settings.hooks ??= {};
  settings.hooks.Stop ??= [];
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
