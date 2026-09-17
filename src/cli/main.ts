import { homedir } from "node:os";
import { resolveBacklogRoot } from "../core/store/paths";
import { runCli } from "./run";

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

const home = homedir();

process.exitCode = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  home,
  backlogRoot: resolveBacklogRoot(process.env, home),
  now: () => new Date(),
  readStdin,
  print: (line) => process.stdout.write(`${line}\n`),
  warn: (line) => process.stderr.write(`${line}\n`),
});
