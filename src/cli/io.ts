export type CliIo = {
  cwd: string;
  home: string;
  backlogRoot: string;
  now: () => Date;
  readStdin: () => Promise<string>;
  print: (line: string) => void;
  warn: (line: string) => void;
};

export const EXIT = { ok: 0, invalid: 1, needsReview: 1, notFound: 2, refused: 3 } as const;

export class UsageError extends Error {}

export function withUsageErrors<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
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
