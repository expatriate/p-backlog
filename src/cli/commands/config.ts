import { parseArgs } from "node:util";
import { LANGUAGES } from "../../core/i18n/language";
import { writeSettings } from "../../core/store/settings";
import { usageError, type CliCommand } from "../command";
import { EXIT, parseChoice, withUsageErrors, type CliIo } from "../io";
import { cliMessages } from "../messages";

export const configCommand: CliCommand = {
  name: "config",
  usage: () => ["language [ru|en]"],
  run: runConfig,
};

async function runConfig(args: string[], io: CliIo): Promise<number> {
  const { positionals } = withUsageErrors(() => parseArgs({ args, allowPositionals: true, options: {} }));
  const [key, ...rest] = positionals;
  if (key === "language") return runLanguage(rest, io);
  throw usageError(configCommand, io.language);
}

async function runLanguage(positionals: string[], io: CliIo): Promise<number> {
  const [value, ...rest] = positionals;
  if (rest.length > 0) throw usageError(configCommand, io.language);
  if (value === undefined) {
    io.print(io.language);
    return EXIT.ok;
  }
  const language = parseChoice(io.language, value, LANGUAGES, cliMessages(io.language).optionLabel.language);
  await writeSettings(io.backlogRoot, { language });
  io.print(`${io.language} → ${language}`);
  return EXIT.ok;
}
