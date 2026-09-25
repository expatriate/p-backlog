import { execFile } from "node:child_process";
import type { ExecOptions, ExecResult } from "./io";

const NOT_FOUND = 127;
const FAILED = 1;

export function execProgram(file: string, args: readonly string[], { timeoutMs }: ExecOptions = {}): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: timeoutMs }, (error, stdout, stderr) => {
      const output = `${stdout}${stderr}`.trim();
      if (error === null) resolve({ code: 0, output });
      else if (error.code === "ENOENT") resolve({ code: NOT_FOUND, output: error.message });
      else resolve({ code: typeof error.code === "number" ? error.code : FAILED, output: output || error.message });
    });
  });
}
