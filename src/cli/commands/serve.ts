import { errorText } from "../../core/errors";
import { readPort } from "../../server/port";
import { startServer } from "../../server/start";
import type { CliCommand } from "../command";
import { EXIT, parseOptions, type CliIo } from "../io";

export const serveCommand: CliCommand = { name: "serve", usage: () => ["[--port N]"], run: runServe };

async function runServe(args: string[], io: CliIo): Promise<number> {
  const values = parseOptions(io.language, args, { port: { type: "string" } });
  const port = readPort(values.port ?? io.env.PORT);
  try {
    await startServer({ root: io.backlogRoot, port, home: io.home, env: io.env, pidFile: io.env.P_BACKLOG_PID_FILE });
  } catch (error) {
    io.warn(errorText(error));
    return EXIT.failed;
  }
  return new Promise<number>(() => {});
}
