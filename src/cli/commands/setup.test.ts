import { chmod, lstat, mkdir, readFile, realpath, stat, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXIT } from "../io";
import { makeCliSandbox } from "../testing/cli-harness";

const repoRoot = join(import.meta.dirname, "../../..");
const STOP_HOOK_COMMAND = "command -v backlog >/dev/null && backlog hook stop || true";
const POWERSHELL_COMMAND = "if (Get-Command backlog.cmd -ErrorAction SilentlyContinue) { backlog.cmd hook stop }";

function claudeEnv(home: string): { CLAUDE_SKILLS_DIR: string; CLAUDE_SETTINGS_PATH: string } {
  return { CLAUDE_SKILLS_DIR: join(home, "skills"), CLAUDE_SETTINGS_PATH: join(home, "claude/settings.json") };
}

describe("backlog setup", () => {
  it("ставит ссылку на русский скилл и хук, повторный запуск сообщает, что всё уже стоит", async () => {
    const { home, run } = await makeCliSandbox();
    const env = claudeEnv(home);

    const first = await run(["setup"], { env });
    expect(first.code).toBe(EXIT.ok);
    expect(await realpath(join(env.CLAUDE_SKILLS_DIR, "backlog"))).toBe(await realpath(join(repoRoot, "skill/backlog")));
    expect(JSON.parse(await readFile(env.CLAUDE_SETTINGS_PATH, "utf8"))).toEqual({
      hooks: { Stop: [{ hooks: [{ type: "command", command: STOP_HOOK_COMMAND }] }] },
    });

    const second = await run(["setup"], { env });
    expect(second.code).toBe(EXIT.ok);
    expect(second.out).toContain("уже установлен");
    expect(second.out).toContain("Хук Stop уже есть");
  });

  it("на Windows пишет хук для PowerShell и не дублирует его", async () => {
    const { home, run } = await makeCliSandbox();
    const env = claudeEnv(home);

    expect((await run(["setup"], { env, platform: "win32" })).code).toBe(EXIT.ok);
    expect(JSON.parse(await readFile(env.CLAUDE_SETTINGS_PATH, "utf8"))).toEqual({
      hooks: { Stop: [{ hooks: [{ type: "command", shell: "powershell", command: POWERSHELL_COMMAND }] }] },
    });

    const second = await run(["setup"], { env, platform: "win32" });
    expect(second.code).toBe(EXIT.ok);
    expect(JSON.parse(await readFile(env.CLAUDE_SETTINGS_PATH, "utf8")).hooks.Stop).toHaveLength(1);
  });

  it("на Windows хук POSIX-формы, уже лежащий в файле, тоже считается своим", async () => {
    const { home, run } = await makeCliSandbox();
    const env = claudeEnv(home);
    await mkdir(dirname(env.CLAUDE_SETTINGS_PATH), { recursive: true });
    await writeFile(env.CLAUDE_SETTINGS_PATH, JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: STOP_HOOK_COMMAND }] }] } }));

    const result = await run(["setup"], { env, platform: "win32" });

    expect(result.code).toBe(EXIT.ok);
    expect(JSON.parse(await readFile(env.CLAUDE_SETTINGS_PATH, "utf8")).hooks.Stop).toHaveLength(1);
  });

  it("чужой каталог скилла не трогает и возвращает отказ, хук при этом не пишет", async () => {
    const { home, run } = await makeCliSandbox();
    const env = claudeEnv(home);
    await mkdir(join(env.CLAUDE_SKILLS_DIR, "backlog"), { recursive: true });

    const result = await run(["setup"], { env });

    expect(result.code).toBe(EXIT.failed);
    await expect(readFile(env.CLAUDE_SETTINGS_PATH, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("сохраняет чужие хуки и настройки", async () => {
    const { home, run } = await makeCliSandbox();
    const env = claudeEnv(home);
    const foreignHook = { hooks: [{ type: "command", command: "say готово" }] };
    await mkdir(dirname(env.CLAUDE_SETTINGS_PATH), { recursive: true });
    await writeFile(env.CLAUDE_SETTINGS_PATH, JSON.stringify({ model: "opus", hooks: { Stop: [foreignHook] } }));

    expect((await run(["setup"], { env })).code).toBe(EXIT.ok);
    expect((await run(["setup"], { env })).out).toContain("Хук Stop уже есть");

    const settings = JSON.parse(await readFile(env.CLAUDE_SETTINGS_PATH, "utf8"));
    expect(settings).toEqual({
      model: "opus",
      hooks: { Stop: [foreignHook, { hooks: [{ type: "command", command: STOP_HOOK_COMMAND }] }] },
    });
  });

  it("сохраняет порядок ключей настроек: в dotfiles не появляется лишний diff", async () => {
    const { home, run } = await makeCliSandbox();
    const env = claudeEnv(home);
    await mkdir(dirname(env.CLAUDE_SETTINGS_PATH), { recursive: true });
    await writeFile(env.CLAUDE_SETTINGS_PATH, JSON.stringify({ model: "opus", permissions: { allow: [] }, hooks: {}, env: { A: "1" } }));

    expect((await run(["setup"], { env })).code).toBe(EXIT.ok);

    expect(Object.keys(JSON.parse(await readFile(env.CLAUDE_SETTINGS_PATH, "utf8")))).toEqual(["model", "permissions", "hooks", "env"]);
  });

  it("настройки-ссылка из dotfiles остаётся ссылкой, хук пишется в её цель с прежними правами", async () => {
    const { home, run } = await makeCliSandbox();
    const env = claudeEnv(home);
    const dotfile = join(home, "dotfiles/claude-settings.json");
    await mkdir(dirname(dotfile), { recursive: true });
    await writeFile(dotfile, JSON.stringify({ model: "opus" }));
    await chmod(dotfile, 0o664);
    await mkdir(dirname(env.CLAUDE_SETTINGS_PATH), { recursive: true });
    await symlink(dotfile, env.CLAUDE_SETTINGS_PATH);

    expect((await run(["setup"], { env })).code).toBe(EXIT.ok);

    expect((await lstat(env.CLAUDE_SETTINGS_PATH)).isSymbolicLink()).toBe(true);
    expect(JSON.parse(await readFile(dotfile, "utf8")).hooks.Stop).toHaveLength(1);
    expect((await stat(dotfile)).mode & 0o777).toBe(0o664);
  });

  it("висячая ссылка на ещё не склонированные dotfiles остаётся ссылкой, хук пишется в её цель", async () => {
    const { home, run } = await makeCliSandbox();
    const env = claudeEnv(home);
    const dotfile = join(home, "dotfiles/claude-settings.json");
    await mkdir(dirname(dotfile), { recursive: true });
    await mkdir(dirname(env.CLAUDE_SETTINGS_PATH), { recursive: true });
    await symlink(dotfile, env.CLAUDE_SETTINGS_PATH);

    expect((await run(["setup"], { env })).code).toBe(EXIT.ok);

    expect((await lstat(env.CLAUDE_SETTINGS_PATH)).isSymbolicLink()).toBe(true);
    expect(JSON.parse(await readFile(dotfile, "utf8")).hooks.Stop).toHaveLength(1);
  });

  it("не трогает настройки, которые не разобрать", async () => {
    const { home, run } = await makeCliSandbox();
    const env = claudeEnv(home);
    await mkdir(dirname(env.CLAUDE_SETTINGS_PATH), { recursive: true });
    await writeFile(env.CLAUDE_SETTINGS_PATH, "{ сломано");

    const result = await run(["setup"], { env });

    expect(result.code).toBe(EXIT.failed);
    expect(result.err).toContain("не объект JSON");
    expect(await readFile(env.CLAUDE_SETTINGS_PATH, "utf8")).toBe("{ сломано");
  });
});
