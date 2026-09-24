import { readFile, writeFile } from "node:fs/promises";
import { access, mkdir } from "node:fs/promises";
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
  it("install пишет скрипт в «Автозагрузку» и запускает его через wscript.exe", async () => {
    const roots = await tempRoots();
    const fake = fakeExec();
    const context = contextFor(roots, fake.exec);

    const outcome = await startupFolderManager(context).install();

    expect(outcome).toBe("done");
    expect(fake.calls).toEqual([`wscript.exe ${scriptPath(roots.appData)}`]);
    await expect(readFile(scriptPath(roots.appData), "utf8")).resolves.toBe(startupScript(context));
  });

  it("install при наличии server.pid останавливает прежний процесс и убирает файл PID", async () => {
    const roots = await tempRoots();
    await mkdir(join(roots.localAppData, "p-backlog"), { recursive: true });
    await writeFile(pidFilePath(roots.localAppData), "4242");
    const stopped: number[] = [];
    const context = contextFor(roots, fakeExec().exec, (pid) => {
      stopped.push(pid);
      return true;
    });

    await startupFolderManager(context).install();

    expect(stopped).toEqual([4242]);
    await expect(access(pidFilePath(roots.localAppData))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("install при мёртвом процессе в server.pid всё равно убирает файл PID", async () => {
    const roots = await tempRoots();
    await mkdir(join(roots.localAppData, "p-backlog"), { recursive: true });
    await writeFile(pidFilePath(roots.localAppData), "4242");
    const context = contextFor(roots, fakeExec().exec, () => false);

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
    await mkdir(join(roots.localAppData, "p-backlog"), { recursive: true });
    await writeFile(pidFilePath(roots.localAppData), "777");
    await writeFile(logPath(roots.localAppData), "лог за прошлый запуск\n");
    const stopped: number[] = [];
    const context = contextFor(roots, fakeExec().exec, (pid) => {
      stopped.push(pid);
      return true;
    });

    const outcome = await startupFolderManager(context).uninstall();

    expect(outcome).toBe("done");
    expect(stopped).toEqual([777]);
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
