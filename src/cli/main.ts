import { errorText } from "../core/errors";
import { homedir } from "node:os";
import { formatLocalIso } from "../core/model/dates";
import { appendRun } from "../core/store/runs";
import { resolveBacklogRoot } from "../core/store/paths";
import { commandName, runCli } from "./run";

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

const home = homedir();
const backlogRoot = resolveBacklogRoot(process.env, home);
const argv = process.argv.slice(2);

const exitCode = await runCli(argv, {
  cwd: process.cwd(),
  home,
  backlogRoot,
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
    rssMb: Math.round((process.resourceUsage().maxRSS / 1024) * 10) / 10,
    exitCode,
  });
} catch (error) {
  process.stderr.write(`Не удалось записать запуск: ${errorText(error)}\n`);
}
