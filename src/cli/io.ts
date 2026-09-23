import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import { errorText } from "../core/errors";
import type { Language } from "../core/i18n/language";
export type CliEnv = {
  cwd: string;
  home: string;
  backlogRoot: string;
  env: NodeJS.ProcessEnv;
  now: () => Date;
  readStdin: () => Promise<string>;
  print: (line: string) => void;
  warn: (line: string) => void;
};

export type CliIo = CliEnv & { language: Language };

export const EXIT = { ok: 0, invalid: 1, notFound: 2, refused: 3, failed: 4, needsReview: 5 } as const;

export class UsageError extends Error {}

export function withUsageErrors<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    throw new UsageError(errorText(error));
  }
}

export function parseOptions<const T extends ParseArgsOptionsConfig>(args: string[], options: T) {
  const { values, positionals } = withUsageErrors(() => parseArgs({ args, options, allowPositionals: true }));
  if (positionals.length > 0) throw new UsageError(`Лишние аргументы: ${positionals.join(" ")}`);
  return values;
}

export function splitList(value: string | undefined): string[] | undefined {
  return value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseChoice<T extends string>(value: string, allowed: readonly T[], label: string): T {
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) throw new UsageError(`${label}: ожидается одно из ${allowed.join(", ")}, получено «${value}»`);
  return match;
}
