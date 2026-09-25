import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import { errorText } from "../core/errors";
import type { Language } from "../core/i18n/language";
import { cliMessages } from "./messages";
export type ExecResult = { code: number; output: string };

export type ExecOptions = { timeoutMs?: number };

export type CliEnv = {
  cwd: string;
  home: string;
  backlogRoot: string;
  packageRoot: string;
  platform: NodeJS.Platform;
  uid: number;
  nodePath: string;
  cliPath: string;
  exec: (file: string, args: readonly string[], options?: ExecOptions) => Promise<ExecResult>;
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

export class ArgumentsError extends UsageError {}

type ArgumentProblem = { kind: "unknownOption" | "missingValue" | "takesNoValue"; option: string };

const END_OF_OPTIONS = "--";

export function parseCommandArgs<const T extends ParseArgsOptionsConfig>(language: Language, args: string[], options: T) {
  try {
    return parseArgs({ args, options, allowPositionals: true });
  } catch (error) {
    const problem = argumentProblem(args, options);
    throw new ArgumentsError(problem === null ? errorText(error) : cliMessages(language).argumentProblem[problem.kind](problem.option));
  }
}

export function parseOptions<const T extends ParseArgsOptionsConfig>(language: Language, args: string[], options: T) {
  const { values, positionals } = parseCommandArgs(language, args, options);
  if (positionals.length > 0) throw new ArgumentsError(cliMessages(language).extraArguments(positionals));
  return values;
}

function argumentProblem(args: readonly string[], options: ParseArgsOptionsConfig): ArgumentProblem | null {
  for (let position = 0; position < args.length; position++) {
    const arg = args[position] ?? "";
    if (arg === END_OF_OPTIONS) return null;
    if (!arg.startsWith("-") || arg === "-") continue;
    const [option = arg, ...inline] = arg.split("=");
    const config = option.startsWith("--") ? options[option.slice(2)] : Object.values(options).find((candidate) => `-${candidate.short}` === option);
    if (config === undefined) return { kind: "unknownOption", option };
    const hasInlineValue = inline.length > 0;
    if (config.type === "boolean" && hasInlineValue) return { kind: "takesNoValue", option };
    if (config.type === "string" && !hasInlineValue) {
      const value = args[position + 1];
      if (value === undefined || value.startsWith("-")) return { kind: "missingValue", option };
      position++;
    }
  }
  return null;
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
