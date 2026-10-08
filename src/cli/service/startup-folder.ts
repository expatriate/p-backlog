import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, win32 } from "node:path";
import { SERVICE_LOG_LIMIT_BYTES } from "../../core/service-log";
import { fileExists } from "../../core/store/fs-utils";
import { PID_FILE_ENV } from "../../core/store/paths";
import { SERVE_COMMAND_NAME } from "../../core/serve-command";
import { numberRecordedIn, serviceEnvironment, type ServiceContext, type ServiceLaunch, type ServiceManager, type ServiceSite } from "./service";

const SCRIPT_NAME = "p-backlog.vbs";
const COMMAND_LINE_ARGUMENT = /"[^"]*"|\S+/g;
const PROCESS_QUERY_TIMEOUT_MS = 15_000;

type ProcessIdentity = "ours" | "other" | "unknown";

function vbsString(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function appDataDir(site: ServiceSite): string {
  return join(site.env.LOCALAPPDATA ?? join(site.home, "AppData", "Local"), "p-backlog");
}

function startupFolder(site: ServiceSite): string {
  return join(site.env.APPDATA ?? join(site.home, "AppData", "Roaming"), "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
}

function logPath(site: ServiceSite): string {
  return join(appDataDir(site), "p-backlog.log");
}

function pidFilePath(site: ServiceSite): string {
  return join(appDataDir(site), "server.pid");
}

const NODE_PATH_ENV = "P_BACKLOG_NODE";
const CLI_PATH_ENV = "P_BACKLOG_CLI";
const LOG_PATH_ENV = "P_BACKLOG_LOG";
// Run and cmd expand %NAME% even inside quotes; values substituted by !NAME! delayed expansion are never re-expanded.
const SERVE_COMMAND = `cmd /v:on /c ""!${NODE_PATH_ENV}!" "!${CLI_PATH_ENV}!" ${SERVE_COMMAND_NAME} >> "!${LOG_PATH_ENV}!" 2>&1"`;

function rotatedLogPath(site: ServiceSite): string {
  return `${logPath(site)}.old`;
}

function logRotation(site: ServiceSite): string[] {
  return [
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    `logFile = ${vbsString(logPath(site))}`,
    `rotatedLogFile = ${vbsString(rotatedLogPath(site))}`,
    "On Error Resume Next",
    "logSize = 0",
    "If fso.FileExists(logFile) Then logSize = fso.GetFile(logFile).Size",
    `If logSize > ${SERVICE_LOG_LIMIT_BYTES} Then`,
    "  fso.DeleteFile rotatedLogFile, True",
    "  fso.MoveFile logFile, rotatedLogFile",
    "End If",
    "On Error GoTo 0",
  ];
}

export function startupScript(launch: ServiceLaunch): string {
  const env = {
    ...serviceEnvironment(launch),
    [PID_FILE_ENV]: pidFilePath(launch),
    [NODE_PATH_ENV]: launch.nodePath,
    [CLI_PATH_ENV]: launch.cliPath,
    [LOG_PATH_ENV]: logPath(launch),
  };
  return [
    'Set shell = CreateObject("WScript.Shell")',
    'Set env = shell.Environment("Process")',
    ...Object.entries(env).map(([key, value]) => `env(${vbsString(key)}) = ${vbsString(value)}`),
    ...logRotation(launch),
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
  return /^node(\.exe)?$/i.test(win32.basename(program)) && sameWindowsPath(script, cliPath) && command === SERVE_COMMAND_NAME;
}

function sameWindowsPath(left: string, right: string): boolean {
  return win32.normalize(left).toLowerCase() === win32.normalize(right).toLowerCase();
}

export function startupFolderManager(context: ServiceContext): ServiceManager {
  const file = join(startupFolder(context), SCRIPT_NAME);
  return {
    file,
    logsHint: logPath(context),
    async install(port) {
      await stopRunningServer(context);
      await mkdir(dirname(file), { recursive: true });
      await mkdir(appDataDir(context), { recursive: true });
      await writeFile(file, `\ufeff${startupScript({ ...context, port })}`, "utf16le");
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
