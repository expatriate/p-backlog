import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join, posix } from "node:path";
import { describe, expect, it } from "vitest";
import { startServer } from "../../server/start";
import { EXIT } from "../io";
import { fakeExec, makeCliSandbox } from "../testing/cli-harness";

const plistPath = (home: string) => join(home, "Library/LaunchAgents/local.p-backlog.plist");
const vbsPath = (home: string) => join(home, "AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup/p-backlog.vbs");
const vbsPidFile = (home: string) => join(home, "AppData/Local/p-backlog/server.pid");

async function closedPort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  if (address === null || typeof address === "string") throw new Error("no port");
  return address.port;
}

describe("backlog service", () => {
  it("install на macOS ставит агент launchd и печатает, где он и где логи", async () => {
    const { home, run } = await makeCliSandbox();

    const result = await run(["service", "install"]);

    expect(result.code).toBe(EXIT.ok);
    expect(result.out).toContain(`Служба установлена: ${plistPath(home)}`);
    expect(result.out).toContain(`Логи: ${posix.join(home, "Library/Logs/p-backlog.log")}`);
    await expect(readFile(plistPath(home), "utf8")).resolves.toContain("<string>serve</string>");
  });

  it("отказ launchctl печатает его код и вывод и возвращает код failed", async () => {
    const { run } = await makeCliSandbox();
    const exec = fakeExec((command) => (command.startsWith("launchctl bootstrap") ? { code: 5, output: "Input/output error" } : { code: 0, output: "" })).exec;

    const result = await run(["service", "install"], { exec });

    expect(result.code).toBe(EXIT.failed);
    expect(result.err).toBe("launchctl bootstrap завершился с кодом 5: Input/output error");
  });

  it("install на Windows пишет p-backlog.vbs в «Автозагрузку» и печатает, где он и где логи", async () => {
    const { home, run } = await makeCliSandbox();

    const result = await run(["service", "install"], { platform: "win32" });

    expect(result.code).toBe(EXIT.ok);
    expect(result.out).toContain(`Служба установлена: ${vbsPath(home)}`);
    expect(result.out).toContain(`Логи: ${join(home, "AppData/Local/p-backlog/p-backlog.log")}`);
    await expect(readFile(vbsPath(home), "utf16le")).resolves.toContain("serve >>");
  });

  it("отказ wscript.exe печатает его код и вывод и возвращает код failed", async () => {
    const { run } = await makeCliSandbox();
    const exec = fakeExec(() => ({ code: 5, output: "Не удалось запустить сценарий" })).exec;

    const result = await run(["service", "install"], { platform: "win32", exec });

    expect(result.code).toBe(EXIT.failed);
    expect(result.err).toBe("wscript.exe завершился с кодом 5: Не удалось запустить сценарий");
  });

  it("install на Windows останавливает прежний сервер по PID из server.pid", async () => {
    const { home, run } = await makeCliSandbox();
    await mkdir(join(home, "AppData/Local/p-backlog"), { recursive: true });
    await writeFile(vbsPidFile(home), "4242");
    const stopped: number[] = [];
    const stopProcess = (pid: number): boolean => {
      stopped.push(pid);
      return true;
    };

    const exec = fakeExec((command) => ({ code: 0, output: command.startsWith("powershell.exe") ? '"C:\\node\\node.exe" "C:\\p-backlog\\dist\\cli.js" serve' : "" })).exec;

    await run(["service", "install"], { platform: "win32", stopProcess, exec });

    expect(stopped).toEqual([4242]);
  });

  it("на Linux без systemd отказывает и советует backlog serve", async () => {
    const { run } = await makeCliSandbox();
    const exec = fakeExec(() => ({ code: 127, output: "" })).exec;

    const result = await run(["service", "install"], { platform: "linux", exec });

    expect(result.code).toBe(EXIT.refused);
    expect(result.err).toContain("не поддерживается");
    expect(result.err).toContain("backlog serve");
  });

  it("status проверяет сервер на порту, записанном в службе", async () => {
    const { home, root, run } = await makeCliSandbox();
    const server = await startServer({ root, port: 0, home, env: {} });
    try {
      await run(["service", "install"], { env: { PORT: String(server.port) } });

      const result = await run(["service", "status"]);

      expect(result.code).toBe(EXIT.ok);
      expect(result.out).toBe(`Служба: установлена · сервер на порту ${server.port}: отвечает`);
    } finally {
      await server.close();
    }
  });

  it("status без службы проверяет порт из PORT", async () => {
    const { run } = await makeCliSandbox();
    const port = await closedPort();

    const result = await run(["service", "status"], { env: { PORT: String(port) } });

    expect(result.out).toBe(`Служба: не установлена · сервер на порту ${port}: не отвечает`);
  });

  it("uninstall удаляет агент, без агента сообщает, что службы нет, с кодом 0", async () => {
    const { home, run } = await makeCliSandbox();
    await run(["service", "install"]);

    expect(await run(["service", "uninstall"])).toMatchObject({ code: EXIT.ok, out: "Служба удалена" });
    await expect(readFile(plistPath(home), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(await run(["service", "uninstall"])).toMatchObject({ code: EXIT.ok, out: "Служба не установлена" });
  });
});

describe("backlog setup --service", () => {
  it("на macOS ставит скилл, хук и службу", async () => {
    const { home, run } = await makeCliSandbox();
    const env = { CLAUDE_SKILLS_DIR: join(home, "skills"), CLAUDE_SETTINGS_PATH: join(home, "claude/settings.json") };

    const result = await run(["setup", "--service"], { env });

    expect(result.code).toBe(EXIT.ok);
    expect(result.out).toContain("Скилл установлен");
    expect(result.out).toContain("Хук Stop добавлен");
    expect(result.out).toContain(`Служба установлена: ${plistPath(home)}`);
  });
});
