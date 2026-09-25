import { errorText } from "../../core/errors";
import { serverMessages } from "../../server/messages";
import { requestedPort } from "../../server/port";
import { BUNDLED_WEB_DIR, closeOnStopSignal, PID_FILE_ENV, startServer } from "../../server/start";
import type { CliCommand } from "../command";
import { EXIT, parseOptions, UsageError, type CliIo } from "../io";

export const serveCommand: CliCommand = { name: "serve", usage: () => ["[--port N]"], run: runServe };

async function runServe(args: string[], io: CliIo): Promise<number> {
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
