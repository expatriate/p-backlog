import { TASK_CATEGORIES } from "../core/model/types";
import { runCategory } from "./commands/category";
import { runCheck } from "./commands/check";
import { runClose } from "./commands/close";
import { runHook } from "./commands/hook";
import { runList } from "./commands/list";
import { runNew } from "./commands/new";
import { runShow } from "./commands/show";
import { runStats } from "./commands/stats";
import { runStatus } from "./commands/status";
import { runTake } from "./commands/take";
import { runVerify } from "./commands/verify";
import { EXIT, UsageError, type CliIo } from "./io";

const USAGE = `Использование:
  backlog new --title <заголовок> [--type task|epic] [--priority low|medium|high|critical] [--tags a,b]
              [--category <категория>] [--found review|incidental]
              [--source файл:строка] [--epic ID] [--blocked-by ID,…] [--related ID,…] [--project id] [--json]
              [--force — создать, даже если похожая открытая задача уже есть]
              (описание задачи читается из stdin)
  backlog list [--query текст] [--status s,…] [--tag t,…] [--project id | --all-projects] [--json]
  backlog stats [--project id | --all-projects] [--json]
  backlog show <ID> [--json]
  backlog take <ID> [--force] [--json]
  backlog take --next [--project id] [--json]
  backlog status <ID> <backlog|in-progress|blocked|done|cancelled>
  backlog category <ID> <${TASK_CATEGORIES.join("|")}|none>
  backlog check [--changed] [--project id | --all-projects] [--json]
  backlog close <ID> --as fixed|obsolete|duplicate --reason <улика> [--duplicate-of <ID>]
  backlog verify <ID> [<ID> …] [--source файл:строка — только для одной задачи]
  backlog hook stop   (для хука Stop в Claude Code, событие читается из stdin)`;

const HELP_ARGUMENTS = new Set(["help", "--help", "-h"]);

const COMMANDS = new Map<string, (args: string[], io: CliIo) => Promise<number>>([
  ["new", runNew],
  ["list", runList],
  ["stats", runStats],
  ["show", runShow],
  ["take", runTake],
  ["status", runStatus],
  ["category", runCategory],
  ["check", runCheck],
  ["close", runClose],
  ["verify", runVerify],
  ["hook", runHook],
]);

export const COMMAND_NAMES: readonly string[] = [...COMMANDS.keys()];

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

export function commandName(argv: readonly string[]): string {
  const [name, sub] = argv;
  if (name === undefined || !COMMAND_NAMES.includes(name)) return "help";
  return name === "hook" && sub !== undefined ? `hook ${sub}` : name;
}
