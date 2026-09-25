import { spawn } from "node:child_process";

const STOP_ARGS = ["hook", "stop", "--agent", "claude"];
const ignoreClosedPipe = () => undefined;

const backlog =
  process.platform === "win32"
    ? spawn(`backlog.cmd ${STOP_ARGS.join(" ")}`, { stdio: ["pipe", "inherit", "inherit"], shell: true })
    : spawn("backlog", STOP_ARGS, { stdio: ["pipe", "inherit", "inherit"] });
backlog.on("error", () => process.exit(0));
backlog.on("close", () => process.exit(0));
backlog.stdin.on("error", ignoreClosedPipe);
process.stdin.pipe(backlog.stdin);
