import { envPort, type CliIo } from "../io";
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

export async function availableServiceManager(platform: NodeJS.Platform, context: ServiceContext): Promise<ServiceManager | null> {
  if (platform === "linux" && !(await systemdAvailable(context.exec))) return null;
  return platformManager(platform, context);
}

function serviceContextOf(io: CliIo): ServiceContext {
  return { ...io, onUnverifiedPid: (pid, pidFile) => io.warn(io.cli.servicePidUnverified(pid, pidFile)) };
}

export function serviceManagerOf(io: CliIo): Promise<ServiceManager | null> {
  return availableServiceManager(io.platform, serviceContextOf(io));
}

export async function servicePort(manager: ServiceManager | null, io: CliIo): Promise<number> {
  return (await manager?.installedPort().catch(() => null)) ?? envPort(io);
}

export function webUiPort(io: CliIo): Promise<number> {
  return servicePort(platformManager(io.platform, serviceContextOf(io)), io);
}
