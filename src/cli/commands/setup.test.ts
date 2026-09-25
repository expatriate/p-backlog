import { chmod, lstat, mkdir, readFile, realpath, stat, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXIT } from "../io";
import { makeCliSandbox } from "../testing/cli-harness";

const repoRoot = join(import.meta.dirname, "../../..");
const STOP_HOOK_COMMAND = "command -v backlog >/dev/null && backlog hook stop || true";
const POWERSHELL_COMMAND = "if (Get-Command backlog.cmd -ErrorAction SilentlyContinue) { backlog.cmd hook stop }";
const CODEX_COMMAND = "command -v backlog >/dev/null && backlog hook stop --agent codex || true";
const CURSOR_COMMAND = "command -v backlog >/dev/null && backlog hook stop --agent cursor || true";

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

  it.skipIf(process.platform === "win32")("настройки-ссылка из dotfiles остаётся ссылкой, хук пишется в её цель с прежними правами (на Windows нет POSIX-прав, а ссылки требуют привилегий)", async () => {
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

  it("ставит скилл и хук каждому найденному агенту и говорит, кого не нашёл", async () => {
    const { home, run } = await makeCliSandbox();
    const env = claudeEnv(home);
    await mkdir(join(home, ".codex"), { recursive: true });

    const result = await run(["setup"], { env });

    expect(result.code).toBe(EXIT.ok);
    expect(await realpath(join(home, ".agents/skills/backlog"))).toBe(await realpath(join(repoRoot, "skill/backlog")));
    expect(JSON.parse(await readFile(join(home, ".codex/hooks.json"), "utf8")).hooks.Stop[0].hooks[0]).toMatchObject({ command: CODEX_COMMAND });
    expect(result.out).toMatch(/^Claude Code: /m);
    expect(result.out).toMatch(/^Codex: /m);
    expect(result.out).toContain(`Cursor: не найден (${join(home, ".cursor")})`);
    await expect(lstat(join(home, ".cursor"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("новый хук Codex просит одобрить в /hooks, уже стоящий — нет", async () => {
    const { home, run } = await makeCliSandbox();
    await mkdir(join(home, ".codex"), { recursive: true });

    const first = await run(["setup", "--agent", "codex"]);
    const again = await run(["setup", "--agent", "codex"]);

    expect(first.out).toContain("Codex: одобрите хук в Codex: /hooks");
    expect(again.out).not.toContain("одобрите");
  });

  it("--agent сужает установку до одного агента", async () => {
    const { home, run } = await makeCliSandbox();
    const env = claudeEnv(home);
    await mkdir(join(home, ".codex"), { recursive: true });

    expect((await run(["setup", "--agent", "cursor"], { env })).code).toBe(EXIT.ok);

    expect(JSON.parse(await readFile(join(home, ".cursor/hooks.json"), "utf8"))).toEqual({ hooks: { stop: [{ command: CURSOR_COMMAND }] }, version: 1 });
    await expect(readFile(env.CLAUDE_SETTINGS_PATH, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(home, ".codex/hooks.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("сбой у одного агента не мешает остальным, но код выхода — отказ", async () => {
    const { home, run } = await makeCliSandbox();
    const env = claudeEnv(home);
    await mkdir(join(home, ".cursor"), { recursive: true });
    await writeFile(join(home, ".cursor/hooks.json"), "{ сломано");

    const result = await run(["setup"], { env });

    expect(result.code).toBe(EXIT.failed);
    expect(JSON.parse(await readFile(env.CLAUDE_SETTINGS_PATH, "utf8")).hooks.Stop).toHaveLength(1);
    expect(result.err).toMatch(/^Cursor: /m);
  });

  it("при включённом плагине не ставит Claude Code скилл и хук и подсказывает, как убрать ручные", async () => {
    const { home, run } = await makeCliSandbox();
    const env = claudeEnv(home);
    const settings = { enabledPlugins: { "p-backlog-ru@p-backlog": true } };
    await mkdir(dirname(env.CLAUDE_SETTINGS_PATH), { recursive: true });
    await writeFile(env.CLAUDE_SETTINGS_PATH, JSON.stringify(settings));

    const result = await run(["setup"], { env });

    expect(result.code).toBe(EXIT.ok);
    expect(result.out).toContain("Claude Code: скилл и хук подключает плагин p-backlog-ru@p-backlog");
    expect(result.out).toContain("backlog setup --remove-manual");
    expect(JSON.parse(await readFile(env.CLAUDE_SETTINGS_PATH, "utf8"))).toEqual(settings);
    await expect(lstat(join(env.CLAUDE_SKILLS_DIR, "backlog"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("--remove-manual снимает только наши скиллы и хуки у всех агентов", async () => {
    const { home, run } = await makeCliSandbox();
    const env = claudeEnv(home);
    const foreignHook = { hooks: [{ type: "command", command: "say готово" }] };
    await mkdir(dirname(env.CLAUDE_SETTINGS_PATH), { recursive: true });
    await writeFile(env.CLAUDE_SETTINGS_PATH, JSON.stringify({ hooks: { Stop: [foreignHook] } }));
    await mkdir(join(home, ".codex"), { recursive: true });
    await mkdir(join(home, ".cursor/skills/backlog"), { recursive: true });
    await run(["setup"], { env });

    const result = await run(["setup", "--remove-manual"], { env });

    expect(result.code).toBe(EXIT.ok);
    expect(JSON.parse(await readFile(env.CLAUDE_SETTINGS_PATH, "utf8"))).toEqual({ hooks: { Stop: [foreignHook] } });
    await expect(lstat(join(env.CLAUDE_SKILLS_DIR, "backlog"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(lstat(join(home, ".agents/skills/backlog"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(JSON.parse(await readFile(join(home, ".codex/hooks.json"), "utf8"))).toEqual({ hooks: {} });
    expect((await lstat(join(home, ".cursor/skills/backlog"))).isDirectory()).toBe(true);
  });

  it("--remove-manual снимает и прежнюю ссылку Codex из <каталог codex>/skills", async () => {
    const { home, run } = await makeCliSandbox();
    const legacyLink = join(home, ".codex/skills/backlog");
    await mkdir(dirname(legacyLink), { recursive: true });
    await symlink(join(repoRoot, "skill/backlog"), legacyLink, "dir");

    const result = await run(["setup", "--remove-manual", "--agent", "codex"]);

    expect(result.code).toBe(EXIT.ok);
    await expect(lstat(legacyLink)).rejects.toMatchObject({ code: "ENOENT" });
    expect(result.out).toContain(`ссылка на скилл снята: ${legacyLink}`);
  });
});
