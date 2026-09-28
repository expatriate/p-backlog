import { execProgram } from "./exec";
import type { CliEnv } from "./io";

export function hostCliEnv(): Pick<CliEnv, "platform" | "uid" | "nodePath" | "exec"> {
  return { platform: process.platform, uid: process.getuid?.() ?? 0, nodePath: process.execPath, exec: execProgram };
}
