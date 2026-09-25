import { readPort } from "../../server/port";
import type { CliIo } from "../io";
import { cliMessages } from "../messages";
import { launchdManager } from "./launchd";
import type { ServiceContext, ServiceManager } from "./service";
import { startupFolderManager } from "./startup-folder";
import { systemdAvailable, systemdManager } from "./systemd";

export async function serviceManagerFor(platform: NodeJS.Platform, context: ServiceContext): Promise<ServiceManager | null> {
  if (platform === "darwin") return launchdManager(context);
  if (platform === "linux" && (await systemdAvailable(context.exec))) return systemdManager(context);
  if (platform === "win32") return startupFolderManager(context);
  return null;
}

export function serviceManagerOf(io: CliIo): Promise<ServiceManager | null> {
  return serviceManagerFor(io.platform, {
    home: io.home,
    env: io.env,
    backlogRoot: io.backlogRoot,
    port: readPort(io.env.PORT),
    nodePath: io.nodePath,
    cliPath: io.cliPath,
    exec: io.exec,
    uid: io.uid,
    stopProcess: io.stopProcess,
    onUnverifiedPid: (pid, pidFile) => io.warn(cliMessages(io.language).servicePidUnverified(pid, pidFile)),
  });
}

export async function portOf(manager: ServiceManager | null, io: CliIo): Promise<number> {
  const installed = await manager?.installedPort().catch(() => null);
  return installed ?? readPort(io.env.PORT);
}

export async function webPort(io: CliIo): Promise<number> {
  return portOf(await serviceManagerOf(io), io);
}
