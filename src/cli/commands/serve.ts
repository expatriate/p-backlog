import { errorText } from "../../core/errors";
import { SERVE_COMMAND_NAME } from "../../core/serve-command";
import { serverMessages } from "../../server/messages";
import { requestedPort } from "../../server/port";
import { PID_FILE_ENV } from "../../core/store/paths";
import { BUNDLED_WEB_DIR, closeOnStopSignal, startServer } from "../../server/start";
import type { CliCommand } from "../command";
import { EXIT, parseOptions, UsageError, type CliIo, type ExitCode } from "../io";

export const serveCommand: CliCommand = { name: SERVE_COMMAND_NAME, usage: () => ["[--port N]"], run: runServe };

async function runServe(args: string[], io: CliIo): Promise<ExitCode> {
  const values = parseOptions(io.language, args, { port: { type: "string" } });
  const [source, value] = values.port === undefined ? ["PORT", io.env.PORT] : ["--port", values.port];
  const port = requestedPort(value);
  if (port === null) throw new UsageError(serverMessages(io.language).invalidPort(source, value ?? ""));
  try {
    const server = await startServer({ root: io.backlogRoot, port, home: io.home, env: io.env, pidFile: io.env[PID_FILE_ENV], staticDir: BUNDLED_WEB_DIR });
    await closeOnStopSignal(server);
  } catch (error) {
    io.warn(errorText(error));
    return EXIT.failed;
  }
  return EXIT.ok;
}
