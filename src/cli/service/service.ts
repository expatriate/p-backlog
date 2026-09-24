import { access, readFile } from "node:fs/promises";
import type { CliEnv } from "../io";

export type ServiceContext = {
  home: string;
  env: NodeJS.ProcessEnv;
  backlogRoot: string;
  port: number;
  nodePath: string;
  cliPath: string;
  exec: CliEnv["exec"];
  uid: number;
  stopProcess: CliEnv["stopProcess"];
};

export type ServiceFailure = { failed: string; code: number; output: string };

export type ServiceOutcome = "done" | "absent" | ServiceFailure;

export type ServiceManager = {
  file: string;
  logs: string;
  install(): Promise<ServiceOutcome>;
  uninstall(): Promise<ServiceOutcome>;
  registered(): Promise<boolean>;
  installedPort(): Promise<number | null>;
};

export function serviceEnvironment(context: ServiceContext): Record<string, string> {
  return { BACKLOG_DIR: context.backlogRoot, PORT: String(context.port), PATH: context.env.PATH ?? "", HOME: context.home };
}

export async function fileExists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

export async function portRecordedIn(file: string, pattern: RegExp): Promise<number | null> {
  const text = await readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  const recorded = pattern.exec(text)?.[1];
  return recorded === undefined ? null : Number(recorded);
}
