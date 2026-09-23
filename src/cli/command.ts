import { UsageError, type CliIo } from "./io";

export type CliCommand = {
  name: string;
  usage: readonly string[];
  run: (args: string[], io: CliIo) => Promise<number>;
};

export function usageText(commands: readonly CliCommand[]): string {
  return ["Использование:", ...commands.flatMap(usageLines)].join("\n");
}

export function usageError(command: CliCommand): UsageError {
  return new UsageError(usageText([command]));
}

function usageLines({ name, usage }: CliCommand): string[] {
  const head = `  backlog ${name} `;
  const continuation = `\n${" ".repeat(head.length)}`;
  return usage.map((line) => head + line.replaceAll("\n", continuation));
}
