import { usageError, type CliCommand } from "../command";
import { serverMessages } from "../../server/messages";
import { requestedPort } from "../../server/port";
import { EXIT, parseCommandArgs, UsageError, type CliIo, type ExitCode } from "../io";
import { serviceManagerOf, servicePort } from "../service/managers";
import { localOrigin, serverResponds } from "../service/server-probe";
import type { ServiceFailure, ServiceManager } from "../service/service";

const STATUS_TIMEOUT_MS = 1000;

type ServiceAction = (manager: ServiceManager, io: CliIo) => Promise<ExitCode>;

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

async function runService(args: string[], io: CliIo): Promise<ExitCode> {
  const { positionals } = parseCommandArgs(io.language, args, {});
  const [name, ...rest] = positionals;
  const action = name === undefined ? undefined : ACTIONS.get(name);
  if (action === undefined || rest.length > 0) throw usageError(serviceCommand, io.language);
  return withServiceManager(io, action);
}

export function installService(io: CliIo): Promise<ExitCode> {
  return withServiceManager(io, installWith);
}

async function withServiceManager(io: CliIo, action: ServiceAction): Promise<ExitCode> {
  const manager = await serviceManagerOf(io);
  if (manager === null) {
    io.warn(io.cli.serviceUnsupported);
    return EXIT.failed;
  }
  return action(manager, io);
}

async function installWith(manager: ServiceManager, io: CliIo): Promise<ExitCode> {
  if (requestedPort(io.env.PORT) === null) throw new UsageError(serverMessages(io.language).invalidPort("PORT", io.env.PORT ?? ""));
  const outcome = await manager.install();
  if (typeof outcome === "object") return reportFailure(outcome, io);
  io.print(io.cli.serviceInstalled(manager.file));
  io.print(io.cli.serviceLogs(manager.logsHint));
  return EXIT.ok;
}

async function uninstallWith(manager: ServiceManager, io: CliIo): Promise<ExitCode> {
  const outcome = await manager.uninstall();
  if (typeof outcome === "object") return reportFailure(outcome, io);
  io.print(outcome === "absent" ? io.cli.serviceNotInstalled : io.cli.serviceUninstalled);
  return EXIT.ok;
}

async function statusWith(manager: ServiceManager, io: CliIo): Promise<ExitCode> {
  const port = await servicePort(manager, io);
  const [registered, responding] = await Promise.all([manager.registered(), serverResponds(localOrigin(port), STATUS_TIMEOUT_MS)]);
  io.print(io.cli.serviceStatus(registered, responding, port));
  return EXIT.ok;
}

function reportFailure({ failed, code, output }: ServiceFailure, io: CliIo): ExitCode {
  io.warn(io.cli.serviceCommandFailed(failed, code, output));
  return EXIT.failed;
}
