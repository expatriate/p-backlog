import { errorText } from "../core/errors";
import { homedir } from "node:os";
import { resolveBacklogRoot } from "../core/store/paths";
import { readPort } from "./port";
import { startServer } from "./start";

const home = homedir();

try {
  await startServer({
    root: resolveBacklogRoot(process.env, home),
    port: readPort(process.env.PORT),
    home,
    env: process.env,
    pidFile: process.env.P_BACKLOG_PID_FILE,
  });
} catch (error) {
  process.stderr.write(`${errorText(error)}\n`);
  process.exit(1);
}
