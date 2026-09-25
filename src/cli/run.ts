import { HOOK_STOP_COMMAND, HOOK_STOP_EVENT } from "../core/stats/cost/hook-signature";
import { errorText } from "../core/errors";
import { coreMessages } from "../core/messages";
import { FileBusyError } from "../core/store/file-lock";
import { localeLanguage, settingsFilePath, settleLanguage } from "../core/store/settings";
import { cliMessages } from "./messages";
import { usageText, type CliCommand } from "./command";
import { categoryCommand } from "./commands/category";
import { checkCommand } from "./commands/check";
import { closeCommand } from "./commands/close";
import { configCommand } from "./commands/config";
import { epicCommand } from "./commands/epic";
import { hookCommand } from "./commands/hook";
import { listCommand } from "./commands/list";
import { newCommand } from "./commands/new";
import { priorityCommand } from "./commands/priority";
import { projectCommand } from "./commands/project";
import { pruneCommand } from "./commands/prune";
import { serveCommand } from "./commands/serve";
import { serviceCommand } from "./commands/service";
import { setupCommand } from "./commands/setup";
import { showCommand } from "./commands/show";
import { statsCommand } from "./commands/stats";
import { statusCommand } from "./commands/status";
import { takeCommand } from "./commands/take";
import { verifyCommand } from "./commands/verify";
import { ArgumentsError, EXIT, UsageError, type CliEnv } from "./io";

export const CLI_COMMANDS: readonly CliCommand[] = [
  newCommand,
  listCommand,
  statsCommand,
  showCommand,
  takeCommand,
  statusCommand,
  priorityCommand,
  categoryCommand,
  epicCommand,
  checkCommand,
  closeCommand,
  pruneCommand,
  verifyCommand,
  projectCommand,
  hookCommand,
  configCommand,
  setupCommand,
  serveCommand,
  serviceCommand,
];

const HELP_ARGUMENTS = new Set(["help", "--help", "-h"]);
const COMMAND_HELP_FLAGS = new Set(["--help", "-h"]);
const END_OF_OPTIONS = "--";

const COMMANDS = new Map(CLI_COMMANDS.map((command) => [command.name, command]));

export async function runCli(argv: readonly string[], env: CliEnv): Promise<number> {
  const [name, ...args] = argv;
  const command = name === undefined ? undefined : COMMANDS.get(name);
  const failureExit = command?.failureExit ?? EXIT.failed;
  const settled = await settleLanguage(env.backlogRoot, env.env).catch((error: unknown) => ({ unreadable: error }));
  if ("unreadable" in settled) {
    env.warn(cliMessages(localeLanguage(env.env)).commandFailed(name ?? "", errorText(settled.unreadable)));
    return failureExit;
  }
  const { language } = settled;
  const io = { ...env, language };
  if (settled.invalidSettingsFile) io.warn(cliMessages(language).settingsFileInvalid(settingsFilePath(env.backlogRoot)));
  if (!command) {
    const askedForHelp = name === undefined || HELP_ARGUMENTS.has(name);
    if (!askedForHelp) {
      io.warn(usageText(CLI_COMMANDS, language));
      return EXIT.invalid;
    }
    io.print(usageText(CLI_COMMANDS, language));
    return EXIT.ok;
  }
  if (asksForCommandHelp(args)) {
    io.print(usageText([command], language));
    return EXIT.ok;
  }
  try {
    return await command.run(args, io);
  } catch (error) {
    if (error instanceof ArgumentsError) {
      io.warn(`${error.message}\n${usageText([command], language)}`);
      return EXIT.invalid;
    }
    if (error instanceof UsageError) {
      io.warn(error.message);
      return EXIT.invalid;
    }
    const reason = error instanceof FileBusyError ? coreMessages(language).fileBusy(error.path, error.lock, error.seconds) : errorText(error);
    io.warn(cliMessages(language).commandFailed(name ?? "", reason));
    return failureExit;
  }
}

function asksForCommandHelp(args: readonly string[]): boolean {
  const optionsEnd = args.indexOf(END_OF_OPTIONS);
  return (optionsEnd === -1 ? args : args.slice(0, optionsEnd)).some((arg) => COMMAND_HELP_FLAGS.has(arg));
}

export function commandName(argv: readonly string[]): string {
  const [name, sub] = argv;
  if (name === undefined || !COMMANDS.has(name)) return "help";
  return name === hookCommand.name && sub === HOOK_STOP_EVENT ? HOOK_STOP_COMMAND : name;
}
