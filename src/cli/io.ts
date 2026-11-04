import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import { errorText } from "../core/errors";
import type { Language } from "../core/i18n/language";
import { coreMessages, type CoreMessages } from "../core/messages";
import { envPortOrDefault, portNumber } from "../core/server-address";
import { cliMessages, type CliMessages } from "./messages";

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
  stopProcess: (pid: number) => void;
  env: NodeJS.ProcessEnv;
  now: () => Date;
  readStdin: () => Promise<string>;
  print: (line: string) => void;
  warn: (line: string) => void;
};

export type CliIo = CliEnv & { language: Language; cli: CliMessages; core: CoreMessages };

export function cliIo(env: CliEnv, language: Language): CliIo {
  return { ...env, language, cli: cliMessages(language), core: coreMessages(language) };
}

export const EXIT = { ok: 0, invalid: 1, notFound: 2, refused: 3, failed: 4, needsReview: 5 } as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

export class UsageError extends Error {}

export class ArgumentsError extends UsageError {}

export class HelpRequested extends Error {}

type ArgumentProblem = { kind: "unknownOption" | "missingValue" | "valueLooksLikeOption" | "takesNoValue" | "repeated"; option: string };

const END_OF_OPTIONS = "--";

const HELP_OPTION_NAMES = new Set(["help", "h"]);

export function parseCommandArgs<const T extends ParseArgsOptionsConfig>(language: Language, args: string[], options: T) {
  if (asksForHelp(args, options)) throw new HelpRequested();
  const parsed = parseOrExplain(language, args, options);
  const repeated = repeatedOption(parsed.tokens, options);
  if (repeated !== null) throw new ArgumentsError(cliMessages(language).argumentProblem.repeated(repeated));
  return parsed;
}

function asksForHelp(args: string[], options: ParseArgsOptionsConfig): boolean {
  const optionsEnd = args.indexOf(END_OF_OPTIONS);
  const { tokens } = parseArgs({ args: optionsEnd === -1 ? args : args.slice(0, optionsEnd), options, strict: false, allowPositionals: true, tokens: true });
  return tokens.some((token) => token.kind === "option" && HELP_OPTION_NAMES.has(token.name));
}

function parseOrExplain<const T extends ParseArgsOptionsConfig>(language: Language, args: string[], options: T) {
  try {
    return parseArgs({ args, options, allowPositionals: true, tokens: true });
  } catch (error) {
    const problem = argumentProblem(args, options);
    throw new ArgumentsError(problem === null ? errorText(error) : cliMessages(language).argumentProblem[problem.kind](problem.option));
  }
}

function repeatedOption(tokens: readonly { kind: string; name?: string }[], options: ParseArgsOptionsConfig): string | null {
  const seen = new Set<string>();
  for (const token of tokens) {
    if (token.kind !== "option" || token.name === undefined || options[token.name]?.multiple === true) continue;
    if (seen.has(token.name)) return `--${token.name}`;
    seen.add(token.name);
  }
  return null;
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
      if (value === undefined) return { kind: "missingValue", option };
      if (value.length > 1 && value.startsWith("-")) return { kind: "valueLooksLikeOption", option };
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

export function parsePort(language: Language, value: string): number {
  return portNumber(value) ?? invalidPort(language, "--port", value);
}

export function envPort(io: Pick<CliIo, "language" | "env">): number {
  const value = io.env.PORT;
  return envPortOrDefault(value) ?? invalidPort(io.language, "PORT", value ?? "");
}

function invalidPort(language: Language, source: string, value: string): never {
  throw new UsageError(cliMessages(language).invalidPort(source, value));
}
