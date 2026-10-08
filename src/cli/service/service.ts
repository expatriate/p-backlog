import { readFile } from "node:fs/promises";
import { hasErrorCode } from "../../core/errors";
import type { CliEnv } from "../io";

export type ServiceSite = Pick<CliEnv, "home" | "env" | "backlogRoot" | "nodePath" | "cliPath">;

export type ServiceLaunch = ServiceSite & { port: number };

export type ServiceContext = ServiceSite & Pick<CliEnv, "exec" | "uid" | "stopProcess"> & { onUnverifiedPid: (pid: number, pidFile: string) => void };

export type ServiceFailure = { failed: string; code: number; output: string };

export type ServiceOutcome = "done" | "absent" | ServiceFailure;

export type ServiceManager = {
  file: string;
  logsHint: string;
  install(port: number): Promise<ServiceOutcome>;
  uninstall(): Promise<ServiceOutcome>;
  registered(): Promise<boolean>;
  installedPort(): Promise<number | null>;
};

export function serviceEnvironment(launch: ServiceLaunch): Record<string, string> {
  return { BACKLOG_DIR: launch.backlogRoot, PORT: String(launch.port), PATH: launch.env.PATH ?? "", HOME: launch.home };
}

export async function numberRecordedIn(file: string, pattern: RegExp, encoding: BufferEncoding = "utf8"): Promise<number | null> {
  const text = await readFile(file, encoding).catch((error: unknown) => {
    if (hasErrorCode(error, "ENOENT")) return "";
    throw error;
  });
  const recorded = pattern.exec(text)?.[1];
  return recorded === undefined ? null : Number(recorded);
}
