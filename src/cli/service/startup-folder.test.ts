import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempDir } from "../../core/store/testing/temp-dirs";
import type { CliEnv } from "../io";
import { fakeExec } from "../testing/cli-harness";
import { startupFolderManager, startupScript } from "./startup-folder";
import type { ServiceContext } from "./service";

type Roots = { home: string; appData: string; localAppData: string };

async function tempRoots(): Promise<Roots> {
  return { home: await makeTempDir(), appData: await makeTempDir(), localAppData: await makeTempDir() };
}

function contextFor(roots: Roots, exec: CliEnv["exec"] = fakeExec().exec, stopProcess: CliEnv["stopProcess"] = () => true): ServiceContext {
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
    const command = `cmd /c ""C:\\node\\node.exe" "C:\\p-backlog\\dist\\cli.js" serve >> "${logPath(roots.localAppData)}" 2>&1"`;
    expect(script).toContain(`shell.Run "${command.replaceAll('"', '""')}", 0, False`);
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
    ["процесса с этим PID уже нет", execAnswering("")],
    ["командную строку процесса не узнать", fakeExec(() => ({ code: 1, output: "Get-CimInstance: Access denied" })).exec],
  ])("install не останавливает процесс из server.pid, если это не наш сервер: %s", async (_case, exec) => {
    const roots = await tempRoots();
    await writePidFile(roots, "4242");
    const stopped: number[] = [];

    await startupFolderManager(contextFor(roots, exec, recordInto(stopped))).install();

    expect(stopped).toEqual([]);
    await expect(access(pidFilePath(roots.localAppData))).rejects.toMatchObject({ code: "ENOENT" });
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

  it("file и logs указывают на скрипт в «Автозагрузке» и лог в LOCALAPPDATA", async () => {
    const roots = await tempRoots();
    const manager = startupFolderManager(contextFor(roots));

    expect(manager.file).toBe(scriptPath(roots.appData));
    expect(manager.logs).toBe(logPath(roots.localAppData));
  });
});
