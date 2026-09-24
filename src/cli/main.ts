import { megabytesOf } from "../core/api/memory";
import { errorText } from "../core/errors";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { formatLocalIso } from "../core/model/dates";
import { appendRun } from "../core/store/runs";
import { resolveBacklogRoot } from "../core/store/paths";
import { settleLanguage } from "../core/store/settings";
import { suppressSqliteExperimentalWarning } from "../core/sqlite-warning";
import { execProgram } from "./exec";
import { cliMessages } from "./messages";
import { commandName, runCli } from "./run";

suppressSqliteExperimentalWarning();

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

const home = homedir();
const backlogRoot = resolveBacklogRoot(process.env, home);
const cliPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(cliPath), "..");
const argv = process.argv.slice(2);

const exitCode = await runCli(argv, {
  cwd: process.cwd(),
  home,
  backlogRoot,
  repoRoot,
  platform: process.platform,
  uid: process.getuid?.() ?? 0,
  nodePath: process.execPath,
  cliPath,
  exec: execProgram,
  stopProcess: (pid) => {
    try {
      process.kill(pid);
      return true;
    } catch {
      return false;
    }
  },
  env: process.env,
  now: () => new Date(),
  readStdin,
  print: (line) => process.stdout.write(`${line}\n`),
  warn: (line) => process.stderr.write(`${line}\n`),
});
process.exitCode = exitCode;

try {
  await appendRun(backlogRoot, {
    at: formatLocalIso(new Date()),
    command: commandName(argv),
    cwd: process.cwd(),
    ms: Math.round(performance.now()),
    rssMb: megabytesOf(process.resourceUsage().maxRSS * 1024),
    exitCode,
  });
} catch (error) {
  const { language } = await settleLanguage(backlogRoot, process.env);
  process.stderr.write(`${cliMessages(language).runNotRecorded(errorText(error))}\n`);
}
