import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { writeSettings } from "../../core/store/settings";
import type { CliEnv, ExecResult } from "../io";
import { runCli } from "../run";
import { gitCommitAll, makeGitRepo, makeTempDir, writeFiles } from "../../core/store/testing/temp-dirs";

type CliRun = { code: number; out: string; err: string };

type CliRunOptions = {
  cwd?: string;
  stdin?: string;
  now?: Date;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  exec?: CliEnv["exec"];
  stopProcess?: CliEnv["stopProcess"];
};

export const SANDBOX_NOW = new Date("2026-09-17T14:50:00Z");
export const SERVICE_PORT = 4400;
const REPO_ROOT = join(import.meta.dirname, "../../..");

export type FakeExec = { exec: CliEnv["exec"]; calls: string[] };

export function fakeExec(reply: (command: string) => ExecResult | Promise<ExecResult> = () => ({ code: 0, output: "" })): FakeExec {
  const calls: string[] = [];
  const exec: CliEnv["exec"] = async (file, args) => {
    const command = [file, ...args].join(" ");
    calls.push(command);
    return reply(command);
  };
  return { exec, calls };
}

export function baseCliEnv(overrides: Pick<CliEnv, "cwd" | "home" | "backlogRoot" | "packageRoot"> & Partial<CliEnv>): CliEnv {
  return {
    platform: "darwin",
    uid: 501,
    nodePath: "node",
    cliPath: "cli.js",
    exec: fakeExec().exec,
    stopProcess: () => true,
    env: {},
    now: () => new Date(),
    readStdin: async () => "",
    print: () => undefined,
    warn: () => undefined,
    ...overrides,
  };
}

export type CliSandbox = {
  home: string;
  root: string;
  repo: string;
  run: (argv: string[], options?: CliRunOptions) => Promise<CliRun>;
};

export async function makeCliSandbox(): Promise<CliSandbox> {
  const home = await makeTempDir();
  const root = join(home, "backlog");
  const repo = await makeGitRepo(home, "projects/spa");
  await writeSettings(root, { language: "ru" });
  const run = async (argv: string[], { cwd = repo, stdin = "", now = SANDBOX_NOW, ...overrides }: CliRunOptions = {}): Promise<CliRun> => {
    const out: string[] = [];
    const err: string[] = [];
    const io = baseCliEnv({
      cwd,
      home,
      backlogRoot: root,
      packageRoot: REPO_ROOT,
      nodePath: "/opt/node/bin/node",
      cliPath: join(REPO_ROOT, "dist/cli.js"),
      now: () => now,
      readStdin: async () => stdin,
      print: (line) => out.push(line),
      warn: (line) => err.push(line),
      ...overrides,
    });
    const code = await runCli(argv, io);
    return { code, out: out.join("\n"), err: err.join("\n") };
  };
  return { home, root, repo, run };
}

export async function commitIn(repo: string): Promise<string> {
  await writeFiles(repo, { "src/a.ts": "a\n" });
  gitCommitAll(repo, "Исправление", "2026-09-17T10:00:00Z");
  return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
}
