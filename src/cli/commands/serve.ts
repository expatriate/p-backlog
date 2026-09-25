import { errorText } from "../../core/errors";
import { parsePort, readPort } from "../../server/port";
import { PID_FILE_ENV, startServer } from "../../server/start";
import type { CliCommand } from "../command";
import { EXIT, parseOptions, UsageError, type CliIo } from "../io";
import { cliMessages } from "../messages";

export const serveCommand: CliCommand = { name: "serve", usage: () => ["[--port N]"], run: runServe };

async function runServe(args: string[], io: CliIo): Promise<number> {
  const values = parseOptions(io.language, args, { port: { type: "string" } });
  const port = values.port === undefined ? readPort(io.env.PORT) : parsePort(values.port);
  if (port === null) throw new UsageError(cliMessages(io.language).invalidPort(values.port ?? ""));
  try {
    await startServer({ root: io.backlogRoot, port, home: io.home, env: io.env, pidFile: io.env[PID_FILE_ENV] });
  } catch (error) {
    io.warn(errorText(error));
    return EXIT.failed;
  }
  return new Promise<number>(() => {});
}
