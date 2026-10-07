import { homedir } from "node:os";
import { errorText } from "../core/errors";
import { suppressSqliteExperimentalWarning } from "../core/sqlite-warning";
import { PID_FILE_ENV, resolveBacklogRoot } from "../core/store/paths";
import { readLanguageOrLocale } from "../core/store/settings";
import { serverMessages } from "./messages";
import { requestedPort } from "./port";
import { BUNDLED_WEB_DIR, closeOnStopSignal, startServer } from "./start";

suppressSqliteExperimentalWarning();

const home = homedir();
const root = resolveBacklogRoot(process.env, home);

try {
  const port = requestedPort(process.env.PORT);
  if (port === null) throw new Error(serverMessages(await readLanguageOrLocale(root, process.env)).invalidPort("PORT", process.env.PORT ?? ""));
  const server = await startServer({ root, port, home, env: process.env, pidFile: process.env[PID_FILE_ENV], staticDir: BUNDLED_WEB_DIR });
  await closeOnStopSignal(server);
} catch (error) {
  process.stderr.write(`${errorText(error)}\n`);
  process.exit(1);
}
