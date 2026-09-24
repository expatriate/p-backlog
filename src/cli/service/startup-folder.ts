import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileExists, portRecordedIn, serviceEnvironment, type ServiceContext, type ServiceManager } from "./service";

const SCRIPT_NAME = "p-backlog.vbs";

function vbsString(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function appDataDir(context: ServiceContext): string {
  return join(context.env.LOCALAPPDATA ?? join(context.home, "AppData", "Local"), "p-backlog");
}

function startupFolder(context: ServiceContext): string {
  return join(context.env.APPDATA ?? join(context.home, "AppData", "Roaming"), "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
}

function logPath(context: ServiceContext): string {
  return join(appDataDir(context), "p-backlog.log");
}

function pidFilePath(context: ServiceContext): string {
  return join(appDataDir(context), "server.pid");
}

export function startupScript(context: ServiceContext): string {
  const command = `cmd /c ""${context.nodePath}" "${context.cliPath}" serve >> "${logPath(context)}" 2>&1"`;
  const env = { ...serviceEnvironment(context), P_BACKLOG_PID_FILE: pidFilePath(context) };
  return [
    'Set shell = CreateObject("WScript.Shell")',
    'Set env = shell.Environment("Process")',
    ...Object.entries(env).map(([key, value]) => `env(${vbsString(key)}) = ${vbsString(value)}`),
    `shell.Run ${vbsString(command)}, 0, False`,
    "",
  ].join("\r\n");
}

async function stopRunningServer(context: ServiceContext): Promise<void> {
  const file = pidFilePath(context);
  const pid = await portRecordedIn(file, /^(\d+)$/);
  if (pid !== null) context.stopProcess(pid);
  await rm(file, { force: true });
}

export function startupFolderManager(context: ServiceContext): ServiceManager {
  const file = join(startupFolder(context), SCRIPT_NAME);
  return {
    file,
    logs: logPath(context),
    async install() {
      await stopRunningServer(context);
      await mkdir(dirname(file), { recursive: true });
      await mkdir(appDataDir(context), { recursive: true });
      await writeFile(file, startupScript(context));
      const { code, output } = await context.exec("wscript.exe", [file]);
      return code === 0 ? "done" : { failed: "wscript.exe", code, output };
    },
    async uninstall() {
      if (!(await fileExists(file))) return "absent";
      await stopRunningServer(context);
      await rm(file, { force: true });
      return "done";
    },
    async registered() {
      return fileExists(file);
    },
    installedPort: () => portRecordedIn(file, /env\("PORT"\) = "(\d+)"/),
  };
}
