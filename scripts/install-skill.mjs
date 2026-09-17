import { lstat, mkdir, readlink, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = resolve(dirname(fileURLToPath(import.meta.url)), "../skill/backlog");
const skillsDir = process.env.CLAUDE_SKILLS_DIR ?? join(homedir(), ".claude/skills");
const target = join(skillsDir, "backlog");

const existing = await lstat(target).catch(() => null);
if (existing === null) {
  await mkdir(skillsDir, { recursive: true });
  await symlink(source, target, "dir");
  console.log(`Скилл установлен: ${target} → ${source}`);
} else if (existing.isSymbolicLink() && resolve(skillsDir, await readlink(target)) === source) {
  console.log(`Скилл уже установлен: ${target}`);
} else {
  console.error(`${target} уже существует и не ведёт в ${source}. Уберите его вручную и повторите.`);
  process.exitCode = 1;
}
