import type { Language } from "../core/i18n/language";
import type { Task } from "../core/model/types";
import { loadBacklog } from "../core/store/load";
import type { TaskChanges } from "../core/store/update";
import { usageError, type CliCommand } from "./command";
import { EXIT, parseCommandArgs, type CliIo } from "./io";
import { requireTask } from "./lookups";
import { taskWriter } from "./task-write";

type TaskFieldSpec<T> = {
  name: string;
  choices: string;
  parse: (language: Language, value: string) => T;
  changes: (value: T) => TaskChanges;
  label: (task: Task, language: Language) => string;
  afterWrite?: (task: Task, io: CliIo) => void;
};

export function taskFieldCommand<T>(spec: TaskFieldSpec<T>): CliCommand {
  const command: CliCommand = {
    name: spec.name,
    usage: () => [`<ID> <${spec.choices}>`],
    run: async (args, io) => {
      const { positionals } = parseCommandArgs(io.language, args, {});
      const [id, rawValue, ...rest] = positionals;
      if (id === undefined || rawValue === undefined || rest.length > 0) throw usageError(command, io.language);
      const value = spec.parse(io.language, rawValue);

      const loaded = await loadBacklog(io.backlogRoot);
      const task = requireTask(loaded, io, id);
      if (!task) return EXIT.notFound;
      const written = await taskWriter(io, loaded.tasks)(task, spec.changes(value));
      if (!written.ok) return written.exitCode;
      spec.afterWrite?.(written.task, io);
      io.print(`${id}: ${spec.label(task, io.language)} → ${spec.label(written.task, io.language)}`);
      return EXIT.ok;
    },
  };
  return command;
}
