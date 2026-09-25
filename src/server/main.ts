import { homedir } from "node:os";
import { errorText } from "../core/errors";
import { suppressSqliteExperimentalWarning } from "../core/sqlite-warning";
import { resolveBacklogRoot } from "../core/store/paths";
import { serverLanguage, serverMessages } from "./messages";
import { requestedPort } from "./port";
import { BUNDLED_WEB_DIR, closeOnStopSignal, PID_FILE_ENV, startServer } from "./start";

suppressSqliteExperimentalWarning();

const home = homedir();
const root = resolveBacklogRoot(process.env, home);

try {
  const port = requestedPort(process.env.PORT);
  if (port === null) throw new Error(serverMessages(await serverLanguage(root, process.env)).invalidPort("PORT", process.env.PORT ?? ""));
  const server = await startServer({ root, port, home, env: process.env, pidFile: process.env[PID_FILE_ENV], staticDir: BUNDLED_WEB_DIR });
  await closeOnStopSignal(server);
} catch (error) {
  process.stderr.write(`${errorText(error)}\n`);
  process.exit(1);
}
