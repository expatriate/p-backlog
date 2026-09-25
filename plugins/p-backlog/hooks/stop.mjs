import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const ignoreClosedPipe = () => undefined;

const backlog = spawn(isWindows ? "backlog.cmd" : "backlog", ["hook", "stop", "--agent", "claude"], {
  stdio: ["pipe", "inherit", "inherit"],
  shell: isWindows,
});
backlog.on("error", () => process.exit(0));
backlog.on("close", () => process.exit(0));
backlog.stdin.on("error", ignoreClosedPipe);
process.stdin.pipe(backlog.stdin);
