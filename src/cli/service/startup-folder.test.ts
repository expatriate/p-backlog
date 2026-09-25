import { access, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { dirname, join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { makeTempDir, writeFiles } from "../../core/store/testing/temp-dirs";
import { execProgram } from "../exec";
import type { CliEnv, ExecResult } from "../io";
import { fakeExec } from "../testing/cli-harness";
import { startupFolderManager, startupScript } from "./startup-folder";
import type { ServiceContext } from "./service";

type Roots = { home: string; appData: string; localAppData: string };

async function tempRoots(): Promise<Roots> {
  return { home: await makeTempDir(), appData: await makeTempDir(), localAppData: await makeTempDir() };
}

function contextFor(
  roots: Roots,
  exec: CliEnv["exec"] = fakeExec().exec,
  stopProcess: CliEnv["stopProcess"] = () => true,
  onUnverifiedPid: ServiceContext["onUnverifiedPid"] = () => undefined,
): ServiceContext {
  return {
    home: roots.home,
    env: { PATH: "/usr/local/bin;/usr/bin", APPDATA: roots.appData, LOCALAPPDATA: roots.localAppData },
    backlogRoot: join(roots.home, "backlog"),
    port: 4400,
    nodePath: "C:\\node\\node.exe",
    cliPath: "C:\\p-backlog\\dist\\cli.js",
    exec,
    uid: 501,
    stopProcess,
    onUnverifiedPid,
  };
}

const scriptPath = (appData: string) => join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "p-backlog.vbs");
const logPath = (localAppData: string) => join(localAppData, "p-backlog", "p-backlog.log");
const pidFilePath = (localAppData: string) => join(localAppData, "p-backlog", "server.pid");
const ourServerCommandLine = '"C:\\node\\node.exe" "C:\\p-backlog\\dist\\cli.js" serve';

async function writePidFile(roots: Roots, pid: string): Promise<void> {
  await mkdir(join(roots.localAppData, "p-backlog"), { recursive: true });
  await writeFile(pidFilePath(roots.localAppData), pid);
}

function execAnswering(commandLine: string): CliEnv["exec"] {
  return fakeExec((command) => ({ code: 0, output: command.startsWith("powershell.exe") && command.includes("ProcessId=4242") ? commandLine : "" })).exec;
}

function powershellFailing(result: ExecResult): CliEnv["exec"] {
  return fakeExec((command) => (command.startsWith("powershell.exe") ? result : { code: 0, output: "" })).exec;
}

function execRunningScriptsInConsole(): CliEnv["exec"] {
  return (file, args, options) => (file === "wscript.exe" ? execProgram("cscript.exe", ["//nologo", ...args], options) : execProgram(file, args, options));
}

async function contentOnceWritten(path: string): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const content = await readFile(path, "utf8").catch(() => "");
    if (content.endsWith("\n")) return content;
    await delay(100);
  }
  throw new Error(`${path} так и не записан`);
}

function recordInto(stopped: number[]): CliEnv["stopProcess"] {
  return (pid) => {
    stopped.push(pid);
    return true;
  };
}

describe("startupScript", () => {
  it("создаёт WScript.Shell, задаёт окружение и без окна запускает serve с логом в LOCALAPPDATA", async () => {
    const roots = await tempRoots();
    const context = contextFor(roots);

    const script = startupScript(context);

    expect(script).toContain('Set shell = CreateObject("WScript.Shell")');
    expect(script).toContain('Set env = shell.Environment("Process")');
    expect(script).toContain(`env("BACKLOG_DIR") = "${join(roots.home, "backlog")}"`);
    expect(script).toContain('env("PORT") = "4400"');
    expect(script).toContain('env("PATH") = "/usr/local/bin;/usr/bin"');
    expect(script).toContain(`env("P_BACKLOG_PID_FILE") = "${pidFilePath(roots.localAppData)}"`);
    expect(script).toContain('env("P_BACKLOG_NODE") = "C:\\node\\node.exe"');
    expect(script).toContain('env("P_BACKLOG_CLI") = "C:\\p-backlog\\dist\\cli.js"');
    expect(script).toContain(`env("P_BACKLOG_LOG") = "${logPath(roots.localAppData)}"`);
    expect(script).toContain('shell.Run "cmd /v:on /c """"!P_BACKLOG_NODE!"" ""!P_BACKLOG_CLI!"" serve >> ""!P_BACKLOG_LOG!"" 2>&1""", 0, False');
  });

  it("пути с %ИМЯ% попадают в строку запуска только через переменные окружения: Run и cmd их не раскроют", async () => {
    const roots = await tempRoots();
    const context = { ...contextFor(roots), nodePath: "C:\\%USERNAME%\\node.exe", cliPath: "C:\\%TEMP%\\dist\\cli.js", env: { LOCALAPPDATA: "C:\\%PATH%" } };

    const lines = startupScript(context).split("\r\n");

    expect(lines).toContain('env("P_BACKLOG_NODE") = "C:\\%USERNAME%\\node.exe"');
    expect(lines).toContain('env("P_BACKLOG_CLI") = "C:\\%TEMP%\\dist\\cli.js"');
    expect(lines).toContain(`env("P_BACKLOG_LOG") = "${join("C:\\%PATH%", "p-backlog", "p-backlog.log")}"`);
    expect(lines.filter((line) => line.startsWith("shell.Run")).join("")).not.toContain("%");
  });

  it("удваивает кавычки внутри путей по правилам VBScript", async () => {
    const roots = await tempRoots();
    const context = { ...contextFor(roots), backlogRoot: `${roots.home}\\back"log` };

    const script = startupScript(context);

    expect(script).toContain(`env("BACKLOG_DIR") = "${roots.home}\\back""log"`);
  });
});

describe("startupFolderManager", () => {
  it("install пишет скрипт в «Автозагрузку» в UTF-16LE с BOM и запускает его через wscript.exe", async () => {
    const roots = await tempRoots();
    const fake = fakeExec();
    const context = contextFor(roots, fake.exec);

    const outcome = await startupFolderManager(context).install();

    expect(outcome).toBe("done");
    expect(fake.calls).toEqual([`wscript.exe ${scriptPath(roots.appData)}`]);
    const bytes = await readFile(scriptPath(roots.appData));
    expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xfe]));
    expect(bytes.toString("utf16le").slice(1)).toBe(startupScript(context));
  });

  it("кириллица в путях переживает запись в UTF-16LE: WSH прочитает её обратно, а не как UTF-8 мойбейк", async () => {
    const roots = await tempRoots();
    const context = { ...contextFor(roots), home: "C:\\Users\\Дмитрий", backlogRoot: "C:\\Users\\Дмитрий\\backlog" };

    await startupFolderManager(context).install();

    const bytes = await readFile(scriptPath(roots.appData));
    expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xfe]));
    const decoded = bytes.toString("utf16le").slice(1);
    expect(decoded).toContain('env("BACKLOG_DIR") = "C:\\Users\\Дмитрий\\backlog"');
    expect(decoded).toContain('env("HOME") = "C:\\Users\\Дмитрий"');
  });

  it("install останавливает прежний сервер из server.pid и убирает файл PID", async () => {
    const roots = await tempRoots();
    await writePidFile(roots, "4242");
    const stopped: number[] = [];
    const context = contextFor(roots, execAnswering(ourServerCommandLine), recordInto(stopped));

    await startupFolderManager(context).install();

    expect(stopped).toEqual([4242]);
    await expect(access(pidFilePath(roots.localAppData))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([
    ["PID занят чужим процессом", execAnswering('"C:\\Program Files\\Notepad++\\notepad++.exe" C:\\notes\\draft.txt')],
    ["node с чужим скриптом", execAnswering('"C:\\node\\node.exe" C:\\work\\build.js serve')],
    ["чужой cli.js serve", execAnswering('"C:\\node\\node.exe" "C:\\work\\tool\\dist\\cli.js" serve')],
    ["процесса с этим PID уже нет", execAnswering("")],
  ])("install не останавливает процесс из server.pid, если это не наш сервер: %s", async (_case, exec) => {
    const roots = await tempRoots();
    await writePidFile(roots, "4242");
    const stopped: number[] = [];

    await startupFolderManager(contextFor(roots, exec, recordInto(stopped))).install();

    expect(stopped).toEqual([]);
    await expect(access(pidFilePath(roots.localAppData))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("наш сервер узнаёт и при другом регистре пути к cli.js", async () => {
    const roots = await tempRoots();
    await writePidFile(roots, "4242");
    const stopped: number[] = [];

    await startupFolderManager(contextFor(roots, execAnswering('"C:\\NODE\\node.exe" "c:\\P-Backlog\\dist\\CLI.JS" serve '), recordInto(stopped))).install();

    expect(stopped).toEqual([4242]);
  });

  it.each([
    ["PowerShell не ответил или не уложился в таймаут", powershellFailing({ code: 1, output: "Get-CimInstance: Access denied" })],
    ["PowerShell не найден", powershellFailing({ code: 127, output: "spawn powershell.exe ENOENT" })],
  ])("если процесс из server.pid не проверить (%s), его не трогает, файл PID оставляет и предупреждает", async (_case, exec) => {
    const roots = await tempRoots();
    await writePidFile(roots, "4242");
    const stopped: number[] = [];
    const unverified: string[] = [];

    const outcome = await startupFolderManager(contextFor(roots, exec, recordInto(stopped), (pid, file) => unverified.push(`${pid} ${file}`))).install();

    expect(outcome).toBe("done");
    expect(stopped).toEqual([]);
    expect(unverified).toEqual([`4242 ${pidFilePath(roots.localAppData)}`]);
    expect(await readFile(pidFilePath(roots.localAppData), "utf8")).toBe("4242");
  });

  it("install при мёртвом процессе в server.pid всё равно убирает файл PID", async () => {
    const roots = await tempRoots();
    await writePidFile(roots, "4242");
    const context = contextFor(roots, execAnswering(ourServerCommandLine), () => false);

    await startupFolderManager(context).install();

    await expect(access(pidFilePath(roots.localAppData))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("отказ wscript.exe возвращает его код и вывод, скрипт остаётся для разбора", async () => {
    const roots = await tempRoots();
    const fake = fakeExec(() => ({ code: 5, output: "Не удалось запустить сценарий" }));
    const context = contextFor(roots, fake.exec);

    const outcome = await startupFolderManager(context).install();

    expect(outcome).toEqual({ failed: "wscript.exe", code: 5, output: "Не удалось запустить сценарий" });
    await expect(access(scriptPath(roots.appData))).resolves.toBeUndefined();
  });

  it("uninstall без скрипта сообщает, что службы нет, и процесс не трогает", async () => {
    const roots = await tempRoots();
    const stopped: number[] = [];
    const context = contextFor(roots, fakeExec().exec, (pid) => {
      stopped.push(pid);
      return true;
    });

    expect(await startupFolderManager(context).uninstall()).toBe("absent");
    expect(stopped).toEqual([]);
  });

  it("uninstall останавливает сервер по PID, удаляет скрипт и оставляет лог", async () => {
    const roots = await tempRoots();
    await startupFolderManager(contextFor(roots)).install();
    await writePidFile(roots, "4242");
    await writeFile(logPath(roots.localAppData), "лог за прошлый запуск\n");
    const stopped: number[] = [];
    const context = contextFor(roots, execAnswering(ourServerCommandLine), recordInto(stopped));

    const outcome = await startupFolderManager(context).uninstall();

    expect(outcome).toBe("done");
    expect(stopped).toEqual([4242]);
    await expect(access(scriptPath(roots.appData))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(logPath(roots.localAppData), "utf8")).resolves.toBe("лог за прошлый запуск\n");
  });

  it("registered отражает наличие файла в «Автозагрузке»", async () => {
    const roots = await tempRoots();
    const manager = startupFolderManager(contextFor(roots));

    expect(await manager.registered()).toBe(false);

    await manager.install();

    expect(await manager.registered()).toBe(true);
  });

  it("installedPort читает порт, записанный в скрипт при установке", async () => {
    const roots = await tempRoots();
    const manager = startupFolderManager(contextFor(roots));

    expect(await manager.installedPort()).toBeNull();

    await manager.install();

    expect(await manager.installedPort()).toBe(4400);
  });

  it.runIf(process.platform === "win32")("на Windows скрипт запускает node и пишет лог по путям с %ИМЯ% как есть, без подстановки переменных", async () => {
    const base = await makeTempDir();
    const roots = { home: await makeTempDir(), appData: await makeTempDir(), localAppData: join(base, "%PATH%") };
    const nodePath = join(base, "%TEMP%", "node.exe");
    const cliPath = join(base, "%USERNAME%", "cli.js");
    await mkdir(dirname(nodePath), { recursive: true });
    await copyFile(process.execPath, nodePath);
    onTestFinished(() => rm(dirname(nodePath), { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }));
    await writeFiles(base, {
      [join("%USERNAME%", "cli.js")]: "console.log(JSON.stringify({ node: process.execPath, argv: process.argv.slice(1), pidFile: process.env.P_BACKLOG_PID_FILE }));\n",
    });
    const context = { ...contextFor(roots, execRunningScriptsInConsole()), env: { ...process.env, LOCALAPPDATA: roots.localAppData }, nodePath, cliPath };

    expect(await startupFolderManager(context).install()).toBe("done");

    const launched: unknown = JSON.parse(await contentOnceWritten(logPath(roots.localAppData)));
    expect(launched).toEqual({ node: nodePath, argv: [cliPath, "serve"], pidFile: pidFilePath(roots.localAppData) });
  });

  it("file и logs указывают на скрипт в «Автозагрузке» и лог в LOCALAPPDATA", async () => {
    const roots = await tempRoots();
    const manager = startupFolderManager(contextFor(roots));

    expect(manager.file).toBe(scriptPath(roots.appData));
    expect(manager.logs).toBe(logPath(roots.localAppData));
  });
});
