import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import { errorText } from "../core/errors";
import { hasErrorCode } from "../core/store/fs-utils";
import type { Language } from "../core/i18n/language";
import { cliMessages } from "./messages";
export type ExecResult = { code: number; output: string };

export type CliEnv = {
  cwd: string;
  home: string;
  backlogRoot: string;
  packageRoot: string;
  platform: NodeJS.Platform;
  uid: number;
  nodePath: string;
  cliPath: string;
  exec: (file: string, args: readonly string[]) => Promise<ExecResult>;
  stopProcess: (pid: number) => boolean;
  env: NodeJS.ProcessEnv;
  now: () => Date;
  readStdin: () => Promise<string>;
  print: (line: string) => void;
  warn: (line: string) => void;
};

export type CliIo = CliEnv & { language: Language };

export const EXIT = { ok: 0, invalid: 1, notFound: 2, refused: 3, failed: 4, needsReview: 5 } as const;

export class UsageError extends Error {}

export type ArgumentProblem = { kind: "unknownOption" | "missingValue" | "takesNoValue"; option: string };

export class ArgumentParseError extends UsageError {
  constructor(
    readonly problem: ArgumentProblem | null,
    message: string,
  ) {
    super(message);
  }
}

const QUOTED_OPTION = /'(-{1,2}[^'\s=]+)/;

export function withUsageErrors<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    throw new ArgumentParseError(argumentProblemOf(error), errorText(error));
  }
}

function argumentProblemOf(error: unknown): ArgumentProblem | null {
  const option = QUOTED_OPTION.exec(errorText(error))?.[1];
  if (option === undefined) return null;
  if (hasErrorCode(error, "ERR_PARSE_ARGS_UNKNOWN_OPTION")) return { kind: "unknownOption", option };
  if (hasErrorCode(error, "ERR_PARSE_ARGS_INVALID_OPTION_VALUE")) return { kind: errorText(error).includes("does not take") ? "takesNoValue" : "missingValue", option };
  return null;
}

export function parseOptions<const T extends ParseArgsOptionsConfig>(language: Language, args: string[], options: T) {
  const { values, positionals } = withUsageErrors(() => parseArgs({ args, options, allowPositionals: true }));
  if (positionals.length > 0) throw new UsageError(cliMessages(language).extraArguments(positionals));
  return values;
}

export function splitList(value: string | undefined): string[] | undefined {
  return value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseChoice<T extends string>(language: Language, value: string, allowed: readonly T[], label: string): T {
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) throw new UsageError(cliMessages(language).invalidChoice(label, allowed, value));
  return match;
}
