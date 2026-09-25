import type { Language } from "../core/i18n/language";
import { UsageError, type CliIo } from "./io";
import { cliMessages } from "./messages";

export type CliCommand = {
  name: string;
  usage: (language: Language) => readonly string[];
  run: (args: string[], io: CliIo) => Promise<number>;
  failureExit?: number;
};

export function usageText(commands: readonly CliCommand[], language: Language): string {
  return [cliMessages(language).usageHeader, ...commands.flatMap((command) => usageLines(command, language))].join("\n");
}

export function usageError(command: CliCommand, language: Language): UsageError {
  return new UsageError(usageText([command], language));
}

function usageLines({ name, usage }: CliCommand, language: Language): string[] {
  const head = `  backlog ${name} `;
  const continuation = `\n${" ".repeat(head.length)}`;
  return usage(language).map((line) => head + line.replaceAll("\n", continuation));
}
