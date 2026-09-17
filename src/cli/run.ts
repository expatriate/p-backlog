import { runList } from "./commands/list";
import { runNew } from "./commands/new";
import { EXIT, UsageError, type CliIo } from "./io";

const USAGE = `Использование:
  backlog new --title <заголовок> [--type task|epic] [--priority low|medium|high|critical] [--tags a,b]
              [--source файл:строка] [--epic ID] [--blocked-by ID,…] [--related ID,…] [--project id] [--json]
              (описание задачи читается из stdin)
  backlog list [--query текст] [--status s,…] [--tag t,…] [--project id | --all-projects] [--json]
  backlog show <ID> [--json]
  backlog take <ID> [--force] [--json]
  backlog take --next [--project id] [--json]
  backlog status <ID> <backlog|in-progress|blocked|done|cancelled>`;

const HELP_ARGUMENTS = new Set(["help", "--help", "-h"]);

const COMMANDS = new Map<string, (args: string[], io: CliIo) => Promise<number>>([
  ["new", runNew],
  ["list", runList],
]);

export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  const [name, ...args] = argv;
  const command = name === undefined ? undefined : COMMANDS.get(name);
  if (!command) {
    io.warn(USAGE);
    const askedForHelp = name === undefined || HELP_ARGUMENTS.has(name);
    return askedForHelp ? EXIT.ok : EXIT.invalid;
  }
  try {
    return await command(args, io);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    io.warn(error.message);
    return EXIT.invalid;
  }
}
