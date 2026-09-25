import { errorText } from "../core/errors";
import { homedir } from "node:os";
import { resolveBacklogRoot } from "../core/store/paths";
import { suppressSqliteExperimentalWarning } from "../core/sqlite-warning";
import { readPort } from "./port";
import { closeOnStopSignal, PID_FILE_ENV, startServer } from "./start";

suppressSqliteExperimentalWarning();

const home = homedir();

try {
  const server = await startServer({
    root: resolveBacklogRoot(process.env, home),
    port: readPort(process.env.PORT),
    home,
    env: process.env,
    pidFile: process.env[PID_FILE_ENV],
  });
  await closeOnStopSignal(server);
} catch (error) {
  process.stderr.write(`${errorText(error)}\n`);
  process.exit(1);
}
