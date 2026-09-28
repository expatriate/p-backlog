import { EXIT, type ExitCode } from "./io";

export async function applyAll<T>(items: Iterable<T>, apply: (item: T) => Promise<ExitCode>): Promise<ExitCode> {
  let firstFailure: ExitCode = EXIT.ok;
  for (const item of items) {
    const code = await apply(item);
    if (firstFailure === EXIT.ok) firstFailure = code;
  }
  return firstFailure;
}
