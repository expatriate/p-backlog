import { join } from "node:path";
import type { CliIo } from "../io";
import { runCli } from "../run";
import { makeGitRepo, makeTempDir } from "../../core/store/testing/temp-dirs";

export type CliRun = { code: number; out: string; err: string };

export type CliSandbox = {
  home: string;
  root: string;
  repo: string;
  run: (argv: string[], options?: { cwd?: string; stdin?: string }) => Promise<CliRun>;
};

export async function makeCliSandbox(): Promise<CliSandbox> {
  const home = await makeTempDir();
  const root = join(home, "backlog");
  const repo = await makeGitRepo(home, "projects/spa");
  const run = async (argv: string[], options: { cwd?: string; stdin?: string } = {}): Promise<CliRun> => {
    const out: string[] = [];
    const err: string[] = [];
    const io: CliIo = {
      cwd: options.cwd ?? repo,
      home,
      backlogRoot: root,
      now: () => new Date("2026-09-17T14:50:00Z"),
      readStdin: async () => options.stdin ?? "",
      print: (line) => out.push(line),
      warn: (line) => err.push(line),
    };
    const code = await runCli(argv, io);
    return { code, out: out.join("\n"), err: err.join("\n") };
  };
  return { home, root, repo, run };
}
