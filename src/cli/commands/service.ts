import { parseArgs } from "node:util";
import { readPort } from "../../server/port";
import { usageError, type CliCommand } from "../command";
import { EXIT, withUsageErrors, type CliIo } from "../io";
import { cliMessages } from "../messages";
import { serviceManagerFor } from "../service/managers";
import type { ServiceFailure, ServiceManager } from "../service/service";

const STATUS_TIMEOUT_MS = 1000;

type ServiceAction = (manager: ServiceManager, io: CliIo) => Promise<number>;

export const serviceCommand: CliCommand = {
  name: "service",
  usage: () => ["install | uninstall | status"],
  run: runService,
};

const ACTIONS = new Map<string, ServiceAction>([
  ["install", installWith],
  ["uninstall", uninstallWith],
  ["status", statusWith],
]);

async function runService(args: string[], io: CliIo): Promise<number> {
  const { positionals } = withUsageErrors(() => parseArgs({ args, allowPositionals: true, options: {} }));
  const [name, ...rest] = positionals;
  const action = name === undefined ? undefined : ACTIONS.get(name);
  if (action === undefined || rest.length > 0) throw usageError(serviceCommand, io.language);
  return withServiceManager(io, action);
}

export function installService(io: CliIo): Promise<number> {
  return withServiceManager(io, installWith);
}

async function withServiceManager(io: CliIo, action: ServiceAction): Promise<number> {
  const manager = await serviceManagerFor(io.platform, {
    home: io.home,
    env: io.env,
    backlogRoot: io.backlogRoot,
    port: readPort(io.env.PORT),
    nodePath: io.nodePath,
    cliPath: io.cliPath,
    exec: io.exec,
    uid: io.uid,
    stopProcess: io.stopProcess,
  });
  if (manager === null) {
    io.warn(cliMessages(io.language).serviceUnsupported);
    return EXIT.failed;
  }
  return action(manager, io);
}

async function installWith(manager: ServiceManager, io: CliIo): Promise<number> {
  const messages = cliMessages(io.language);
  const outcome = await manager.install();
  if (typeof outcome === "object") return reportFailure(outcome, io);
  io.print(messages.serviceInstalled(manager.file));
  io.print(messages.serviceLogs(manager.logs));
  return EXIT.ok;
}

async function uninstallWith(manager: ServiceManager, io: CliIo): Promise<number> {
  const messages = cliMessages(io.language);
  const outcome = await manager.uninstall();
  if (typeof outcome === "object") return reportFailure(outcome, io);
  io.print(outcome === "absent" ? messages.serviceNotInstalled : messages.serviceUninstalled);
  return EXIT.ok;
}

async function statusWith(manager: ServiceManager, io: CliIo): Promise<number> {
  const port = (await manager.installedPort()) ?? readPort(io.env.PORT);
  const [registered, responding] = await Promise.all([manager.registered(), serverResponds(port)]);
  io.print(cliMessages(io.language).serviceStatus(registered, responding, port));
  return EXIT.ok;
}

async function serverResponds(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/settings`, { signal: AbortSignal.timeout(STATUS_TIMEOUT_MS) });
    return response.ok;
  } catch {
    return false;
  }
}

function reportFailure({ failed, code, output }: ServiceFailure, io: CliIo): number {
  io.warn(cliMessages(io.language).serviceCommandFailed(failed, code, output));
  return EXIT.failed;
}
