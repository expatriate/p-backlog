import { HOOK_STOP_COMMAND, HOOK_STOP_EVENT } from "../core/stats/cost/hook-signature";
import { errorText } from "../core/errors";
import { coreMessages } from "../core/messages";
import { FileBusyError } from "../core/store/file-lock";
import { resolveLanguage } from "../core/store/settings";
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
import { showCommand } from "./commands/show";
import { statsCommand } from "./commands/stats";
import { statusCommand } from "./commands/status";
import { takeCommand } from "./commands/take";
import { verifyCommand } from "./commands/verify";
import { EXIT, UsageError, type CliEnv } from "./io";

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
];

const HELP_ARGUMENTS = new Set(["help", "--help", "-h"]);

const COMMANDS = new Map(CLI_COMMANDS.map((command) => [command.name, command.run]));

export async function runCli(argv: readonly string[], env: CliEnv): Promise<number> {
  const language = await resolveLanguage(env.backlogRoot, env.env);
  const io = { ...env, language };
  const [name, ...args] = argv;
  const command = name === undefined ? undefined : COMMANDS.get(name);
  if (!command) {
    io.warn(usageText(CLI_COMMANDS, language));
    const askedForHelp = name === undefined || HELP_ARGUMENTS.has(name);
    return askedForHelp ? EXIT.ok : EXIT.invalid;
  }
  try {
    return await command(args, io);
  } catch (error) {
    if (error instanceof UsageError) {
      io.warn(error.message);
      return EXIT.invalid;
    }
    const reason = error instanceof FileBusyError ? coreMessages(language).fileBusy(error.path, error.lock, error.seconds) : errorText(error);
    io.warn(cliMessages(language).commandFailed(name ?? "", reason));
    return EXIT.failed;
  }
}

export function commandName(argv: readonly string[]): string {
  const [name, sub] = argv;
  if (name === undefined || !COMMANDS.has(name)) return "help";
  return name === hookCommand.name && sub === HOOK_STOP_EVENT ? HOOK_STOP_COMMAND : name;
}
