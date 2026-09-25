import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, win32 } from "node:path";
import { PID_FILE_ENV } from "../../core/store/paths";
import { fileExists, numberRecordedIn, serviceEnvironment, type ServiceContext, type ServiceManager } from "./service";

const SCRIPT_NAME = "p-backlog.vbs";
const COMMAND_LINE_ARGUMENT = /"[^"]*"|\S+/g;
const PROCESS_QUERY_TIMEOUT_MS = 15_000;

type ProcessIdentity = "ours" | "other" | "unknown";

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

const NODE_PATH_ENV = "P_BACKLOG_NODE";
const CLI_PATH_ENV = "P_BACKLOG_CLI";
const LOG_PATH_ENV = "P_BACKLOG_LOG";
// Run and cmd expand %NAME% even inside quotes; values substituted by !NAME! delayed expansion are never re-expanded.
const SERVE_COMMAND = `cmd /v:on /c ""!${NODE_PATH_ENV}!" "!${CLI_PATH_ENV}!" serve >> "!${LOG_PATH_ENV}!" 2>&1"`;

export function startupScript(context: ServiceContext): string {
  const env = {
    ...serviceEnvironment(context),
    [PID_FILE_ENV]: pidFilePath(context),
    [NODE_PATH_ENV]: context.nodePath,
    [CLI_PATH_ENV]: context.cliPath,
    [LOG_PATH_ENV]: logPath(context),
  };
  return [
    'Set shell = CreateObject("WScript.Shell")',
    'Set env = shell.Environment("Process")',
    ...Object.entries(env).map(([key, value]) => `env(${vbsString(key)}) = ${vbsString(value)}`),
    `shell.Run ${vbsString(SERVE_COMMAND)}, 0, False`,
    "",
  ].join("\r\n");
}

async function stopRunningServer(context: ServiceContext): Promise<void> {
  const file = pidFilePath(context);
  const pid = await numberRecordedIn(file, /^(\d+)$/);
  if (pid !== null) {
    const identity = await processIdentity(context, pid);
    if (identity === "unknown") {
      context.onUnverifiedPid(pid, file);
      return;
    }
    if (identity === "ours") context.stopProcess(pid);
  }
  await rm(file, { force: true });
}

async function processIdentity(context: ServiceContext, pid: number): Promise<ProcessIdentity> {
  const query = `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine`;
  const { code, output } = await context.exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", query], { timeoutMs: PROCESS_QUERY_TIMEOUT_MS });
  if (code !== 0) return "unknown";
  return runsServerScript(output, context.cliPath) ? "ours" : "other";
}

function runsServerScript(commandLine: string, cliPath: string): boolean {
  const args = (commandLine.match(COMMAND_LINE_ARGUMENT) ?? []).map((arg) => arg.replaceAll('"', ""));
  if (args.length !== 3) return false;
  const [program = "", script = "", command] = args;
  return /^node(\.exe)?$/i.test(win32.basename(program)) && sameWindowsPath(script, cliPath) && command === "serve";
}

function sameWindowsPath(left: string, right: string): boolean {
  return win32.normalize(left).toLowerCase() === win32.normalize(right).toLowerCase();
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
      await writeFile(file, `\ufeff${startupScript(context)}`, "utf16le");
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
    installedPort: () => numberRecordedIn(file, /env\("PORT"\) = "(\d+)"/, "utf16le"),
  };
}
