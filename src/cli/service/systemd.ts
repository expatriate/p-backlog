import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CliEnv } from "../io";
import { fileExists, portRecordedIn, serviceEnvironment, type ServiceContext, type ServiceManager, type ServiceOutcome } from "./service";

const UNIT = "p-backlog.service";

function quoted(value: string): string {
  return `"${value.replace(/[\\"]/g, "\\$&").replaceAll("%", "%%")}"`;
}

function quotedArgument(value: string): string {
  return quoted(value).replaceAll("$", () => "$$");
}

export function systemdUnit(context: ServiceContext): string {
  const environment = Object.entries(serviceEnvironment(context))
    .map(([key, value]) => `Environment=${quoted(`${key}=${value}`)}\n`)
    .join("");
  return `[Unit]
Description=p-backlog web UI

[Service]
ExecStart=${quotedArgument(context.nodePath)} ${quotedArgument(context.cliPath)} serve
${environment}Restart=on-failure

[Install]
WantedBy=default.target
`;
}

export async function systemdAvailable(exec: CliEnv["exec"]): Promise<boolean> {
  return (await exec("systemctl", ["--user", "--version"])).code === 0;
}

async function systemctlSteps(exec: CliEnv["exec"], steps: readonly (readonly string[])[]): Promise<ServiceOutcome> {
  for (const step of steps) {
    const args = ["--user", ...step];
    const { code, output } = await exec("systemctl", args);
    if (code !== 0) return { failed: ["systemctl", ...args].join(" "), code, output };
  }
  return "done";
}

export function systemdManager(context: ServiceContext): ServiceManager {
  const file = join(context.home, ".config/systemd/user", UNIT);
  return {
    file,
    logs: "journalctl --user -u p-backlog",
    async install() {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, systemdUnit(context));
      return systemctlSteps(context.exec, [["daemon-reload"], ["enable", UNIT], ["restart", UNIT]]);
    },
    async uninstall() {
      if (!(await fileExists(file))) return "absent";
      const stopped = await systemctlSteps(context.exec, [["disable", "--now", UNIT]]);
      if (stopped !== "done") return stopped;
      await rm(file, { force: true });
      return systemctlSteps(context.exec, [["daemon-reload"]]);
    },
    async registered() {
      return (await fileExists(file)) && (await context.exec("systemctl", ["--user", "is-enabled", UNIT])).code === 0;
    },
    installedPort: () => portRecordedIn(file, /^Environment="PORT=(\d+)"$/m),
  };
}
