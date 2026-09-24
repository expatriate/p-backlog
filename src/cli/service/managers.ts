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
