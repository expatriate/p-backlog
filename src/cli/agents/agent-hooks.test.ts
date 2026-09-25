import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir } from "../../core/store/testing/temp-dirs";
import { installAgentHook, removeAgentHook } from "./agent-hooks";

const CLI_PATH = "C:\\npm\\node_modules\\p-backlog\\dist\\cli.js";
const CODEX_HOOK = {
  type: "command",
  command: "command -v backlog >/dev/null && backlog hook stop --agent codex || true",
  commandWindows: `node "${CLI_PATH}" hook stop --agent codex`,
  timeout: 30,
};

async function site(platform: NodeJS.Platform = "darwin") {
  const home = await makeTempDir();
  return { home, env: {}, platform, cliPath: CLI_PATH };
}

async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value));
}

const readJson = async (path: string) => JSON.parse(await readFile(path, "utf8"));

describe("хуки агентов", () => {
  it("Codex: хук добавляется к чужим, порядок ключей сохраняется, повтор не дублирует", async () => {
    const target = await site();
    const path = join(target.home, ".codex/hooks.json");
    const foreign = { hooks: [{ type: "command", command: "notify-send done" }] };
    await writeJson(path, { description: "мои хуки", hooks: { PreToolUse: [], Stop: [foreign] } });

    expect(await installAgentHook("codex", target)).toBe("added");
    expect(await installAgentHook("codex", target)).toBe("exists");

    const config = await readJson(path);
    expect(Object.keys(config)).toEqual(["description", "hooks"]);
    expect(config.hooks).toEqual({ PreToolUse: [], Stop: [foreign, { hooks: [CODEX_HOOK] }] });
  });

  it("Codex: CODEX_HOME задаёт каталог конфига", async () => {
    const target = await site();
    const codexHome = join(target.home, "elsewhere");

    expect(await installAgentHook("codex", { ...target, env: { CODEX_HOME: codexHome } })).toBe("added");

    expect((await readJson(join(codexHome, "hooks.json"))).hooks.Stop).toEqual([{ hooks: [CODEX_HOOK] }]);
  });

  it("Cursor: пишет version 1 и хук платформы, чужие хуки на месте", async () => {
    const posix = await site();
    const posixPath = join(posix.home, ".cursor/hooks.json");
    await writeJson(posixPath, { hooks: { stop: [{ command: "./hooks/audit.sh" }], afterFileEdit: [{ command: "./fmt.sh" }] } });

    expect(await installAgentHook("cursor", posix)).toBe("added");
    expect(await installAgentHook("cursor", posix)).toBe("exists");
    expect(await readJson(posixPath)).toEqual({
      hooks: {
        stop: [{ command: "./hooks/audit.sh" }, { command: "command -v backlog >/dev/null && backlog hook stop --agent cursor || true" }],
        afterFileEdit: [{ command: "./fmt.sh" }],
      },
      version: 1,
    });

    const windows = await site("win32");
    expect(await installAgentHook("cursor", windows)).toBe("added");
    expect(await readJson(join(windows.home, ".cursor/hooks.json"))).toEqual({
      hooks: { stop: [{ command: `node "${CLI_PATH}" hook stop --agent cursor` }] },
      version: 1,
    });
  });

  it("Codex: наш хук со старым путём к cli.js обновляется на месте, чужие ключи и хуки целы", async () => {
    const target = await site();
    const path = join(target.home, ".codex/hooks.json");
    const foreign = { type: "command", command: "notify-send done" };
    const stale = { ...CODEX_HOOK, commandWindows: 'node "C:\\Users\\me\\.nvm\\v20\\p-backlog\\dist\\cli.js" hook stop --agent codex', timeout: 10, statusMessage: "backlog" };
    await writeJson(path, { hooks: { Stop: [{ hooks: [foreign, stale] }] } });

    expect(await installAgentHook("codex", target)).toBe("updated");
    expect(await installAgentHook("codex", target)).toBe("exists");

    expect((await readJson(path)).hooks.Stop).toEqual([{ hooks: [foreign, { ...CODEX_HOOK, statusMessage: "backlog" }] }]);
  });

  it("Cursor на Windows: команда со старым путём к cli.js заменяется текущей", async () => {
    const target = await site("win32");
    const path = join(target.home, ".cursor/hooks.json");
    await writeJson(path, { version: 1, hooks: { stop: [{ command: 'node "D:\\old\\dist\\cli.js" hook stop --agent cursor' }] } });

    expect(await installAgentHook("cursor", target)).toBe("updated");

    expect(await readJson(path)).toEqual({ version: 1, hooks: { stop: [{ command: `node "${CLI_PATH}" hook stop --agent cursor` }] } });
  });

  it("чужая обёртка вокруг нашей команды — не наш хук: ставим свой рядом и не снимаем её", async () => {
    const target = await site();
    const path = join(target.home, ".codex/hooks.json");
    const wrapper = { hooks: [{ type: "command", command: "mywrap backlog hook stop --agent codex" }] };
    await writeJson(path, { hooks: { Stop: [wrapper] } });

    expect(await installAgentHook("codex", target)).toBe("added");
    expect(await removeAgentHook("codex", target)).toBe("removed");
    expect(await removeAgentHook("codex", target)).toBe("absent");

    expect(await readJson(path)).toEqual({ hooks: { Stop: [wrapper] } });
  });

  it("снятие убирает только наш хук у всех трёх агентов", async () => {
    const target = await site();
    const claudeSettings = join(target.home, ".claude/settings.json");
    const foreignClaude = { hooks: [{ type: "command", command: "say готово" }] };
    await writeJson(claudeSettings, { model: "opus", hooks: { Stop: [foreignClaude] } });
    for (const agent of ["claude", "codex", "cursor"] as const) await installAgentHook(agent, target);

    for (const agent of ["claude", "codex", "cursor"] as const) expect(await removeAgentHook(agent, target)).toBe("removed");
    expect(await removeAgentHook("codex", target)).toBe("absent");

    expect(await readJson(claudeSettings)).toEqual({ model: "opus", hooks: { Stop: [foreignClaude] } });
    expect(await readJson(join(target.home, ".codex/hooks.json"))).toEqual({ hooks: {} });
    expect(await readJson(join(target.home, ".cursor/hooks.json"))).toEqual({ hooks: {}, version: 1 });
  });

  it("битый конфиг не трогает и сообщает", async () => {
    const target = await site();
    const path = join(target.home, ".cursor/hooks.json");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "{ сломано");

    expect(await installAgentHook("cursor", target)).toEqual({ failed: "invalid" });
    expect(await readFile(path, "utf8")).toBe("{ сломано");
  });
});
