import { EXIT } from "./io";

export async function applyAll<T>(items: Iterable<T>, apply: (item: T) => Promise<number>): Promise<number> {
  let firstFailure: number = EXIT.ok;
  for (const item of items) {
    const code = await apply(item);
    if (firstFailure === EXIT.ok) firstFailure = code;
  }
  return firstFailure;
}
