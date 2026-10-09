import { errorText } from "../../core/errors";
import { SERVE_COMMAND_NAME } from "../../core/serve-command";
import { PID_FILE_ENV } from "../../core/store/paths";
import { BUNDLED_WEB_DIR, closeOnStopSignal, startServer } from "../../server/start";
import type { CliCommand } from "../command";
import { envPort, EXIT, parseOptions, parsePort, type CliIo, type ExitCode } from "../io";

export const serveCommand: CliCommand = { name: SERVE_COMMAND_NAME, usage: () => ["[--port N]"], run: runServe };

async function runServe(args: string[], io: CliIo): Promise<ExitCode> {
  const values = parseOptions(io.language, args, { port: { type: "string" } });
  const port = values.port === undefined ? envPort(io) : parsePort(io.language, values.port);
  try {
    const server = await startServer({
      root: io.backlogRoot,
      port,
      home: io.home,
      env: io.env,
      platform: io.platform,
      log: io.print,
      warn: io.warn,
      pidFile: io.env[PID_FILE_ENV],
      staticDir: BUNDLED_WEB_DIR,
      settledLanguage: io.language,
    });
    await closeOnStopSignal(server);
  } catch (error) {
    io.warn(errorText(error));
    return EXIT.failed;
  }
  return EXIT.ok;
}
