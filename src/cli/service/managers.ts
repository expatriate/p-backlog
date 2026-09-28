import { readPort } from "../../server/port";
import type { CliIo } from "../io";
import { cliMessages } from "../messages";
import { launchdManager } from "./launchd";
import type { ServiceContext, ServiceManager } from "./service";
import { startupFolderManager } from "./startup-folder";
import { systemdAvailable, systemdManager } from "./systemd";

function platformManager(platform: NodeJS.Platform, context: ServiceContext): ServiceManager | null {
  if (platform === "darwin") return launchdManager(context);
  if (platform === "linux") return systemdManager(context);
  if (platform === "win32") return startupFolderManager(context);
  return null;
}

export async function serviceManagerFor(platform: NodeJS.Platform, context: ServiceContext): Promise<ServiceManager | null> {
  if (platform === "linux" && !(await systemdAvailable(context.exec))) return null;
  return platformManager(platform, context);
}

function serviceContextOf(io: CliIo): ServiceContext {
  return { ...io, port: readPort(io.env.PORT), onUnverifiedPid: (pid, pidFile) => io.warn(cliMessages(io.language).servicePidUnverified(pid, pidFile)) };
}

export function serviceManagerOf(io: CliIo): Promise<ServiceManager | null> {
  return serviceManagerFor(io.platform, serviceContextOf(io));
}

export async function portOf(manager: ServiceManager | null, io: CliIo): Promise<number> {
  const installed = await manager?.installedPort().catch(() => null);
  return installed ?? readPort(io.env.PORT);
}

export function webPort(io: CliIo): Promise<number> {
  return portOf(platformManager(io.platform, serviceContextOf(io)), io);
}
