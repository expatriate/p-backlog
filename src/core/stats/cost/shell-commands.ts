const SEPARATORS = ["&&", "||", ";", "|", "&", "\n", "`"];
const HEREDOC_START = /^<<-?\s*(['"]?)([^\s'"<>;&|()]+)\1/;
const HERE_STRING = "<<<";
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const DURATION = /^\d+(\.\d+)?[smhd]?$/;
const WINDOWS_EXECUTABLE = /\.(cmd|exe|ps1)$/i;
const XARGS_PLACEHOLDER = "{}";
const PACKAGE_OPTION = "--package=";
const BACKLOG_BIN = "backlog";
const BACKLOG_PACKAGE = "p-backlog";
const SHELL_KEYWORDS = new Set(["if", "then", "else", "elif", "do", "while", "until", "!", "{"]);
const WRAPPERS = new Set(["time", "sudo", "env", "timeout", "xargs", "nice", "nohup", "exec"]);
const PACKAGE_RUNNERS = new Set(["npx", "bunx", "pnpx"]);
const RUNNER_SUBCOMMANDS: Readonly<Record<string, readonly string[]>> = { pnpm: ["dlx"], yarn: ["dlx"], npm: ["exec", "x"], bun: ["x"] };

export function invokesBacklog(script: string): boolean {
  return simpleCommands(script).some((command) => {
    const [program, ...args] = programWords(command.split(/\s+/));
    if (program === undefined) return false;
    const name = executableName(program);
    if (name === BACKLOG_BIN) return true;
    const runnerArgs = packageRunnerArguments(name, args);
    return runnerArgs !== null && runsBacklogPackage(runnerArgs);
  });
}

function programWords(words: readonly string[]): string[] {
  let rest = dropWhile(words, (word) => word === "" || ENV_ASSIGNMENT.test(word) || SHELL_KEYWORDS.has(word));
  while (rest[0] !== undefined && WRAPPERS.has(rest[0])) {
    rest = dropWhile(rest.slice(1), isWrapperArgument);
  }
  return rest;
}

function isWrapperArgument(word: string): boolean {
  return word === "" || word.startsWith("-") || ENV_ASSIGNMENT.test(word) || DURATION.test(word) || word === XARGS_PLACEHOLDER;
}

function dropWhile(words: readonly string[], skipped: (word: string) => boolean): string[] {
  const first = words.findIndex((word) => !skipped(word));
  return first === -1 ? [] : words.slice(first);
}

function executableName(program: string): string {
  return (program.split(/[\\/]/).at(-1) ?? program).replace(WINDOWS_EXECUTABLE, "");
}

function packageRunnerArguments(name: string, args: readonly string[]): readonly string[] | null {
  if (PACKAGE_RUNNERS.has(name)) return args;
  const [subcommand, ...rest] = args;
  return subcommand !== undefined && RUNNER_SUBCOMMANDS[name]?.includes(subcommand) === true ? rest : null;
}

function runsBacklogPackage(args: readonly string[]): boolean {
  const isBacklogPackage = (spec: string | undefined) => spec === BACKLOG_PACKAGE || spec?.startsWith(`${BACKLOG_PACKAGE}@`) === true;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] ?? "";
    if (arg.startsWith(PACKAGE_OPTION)) {
      if (isBacklogPackage(arg.slice(PACKAGE_OPTION.length))) return true;
    } else if (arg === "-p" || arg === "--package") {
      if (isBacklogPackage(args[++index])) return true;
    } else if (!arg.startsWith("-")) return isBacklogPackage(arg);
  }
  return false;
}

type Context = { kind: "double" } | { kind: "group"; outer: string };

function simpleCommands(script: string): string[] {
  const commands: string[] = [];
  const contexts: Context[] = [];
  const pendingHeredocs: string[] = [];
  let current = "";
  let position = 0;
  const finishCommand = () => {
    commands.push(current.trim());
    current = "";
  };
  const openGroup = (length: number) => {
    contexts.push({ kind: "group", outer: current });
    current = "";
    position += length;
  };
  while (position < script.length) {
    const char = script.charAt(position);
    const context = contexts.at(-1);
    if (context?.kind === "double") {
      if (char === "\\") position += 2;
      else if (char === '"') {
        contexts.pop();
        position++;
      } else if (script.startsWith("$(", position)) openGroup(2);
      else position++;
      continue;
    }
    if (char === "'") {
      const end = script.indexOf("'", position + 1);
      position = end === -1 ? script.length : end + 1;
      continue;
    }
    if (char === '"') {
      contexts.push({ kind: "double" });
      position++;
      continue;
    }
    if (char === "\\") {
      position += 2;
      continue;
    }
    if (char === "#" && /(^|\s)$/.test(current)) {
      const end = script.indexOf("\n", position);
      position = end === -1 ? script.length : end;
      continue;
    }
    if (script.startsWith(HERE_STRING, position)) {
      current += HERE_STRING;
      position += HERE_STRING.length;
      continue;
    }
    const heredoc = HEREDOC_START.exec(script.slice(position));
    if (heredoc) {
      pendingHeredocs.push(heredoc[2] ?? "");
      position += heredoc[0].length;
      continue;
    }
    if (char === "\n" && pendingHeredocs.length > 0) {
      finishCommand();
      position = afterHeredocBodies(script, position + 1, pendingHeredocs.splice(0));
      continue;
    }
    if (script.startsWith("$(", position)) {
      openGroup(2);
      continue;
    }
    if (char === "(") {
      openGroup(1);
      continue;
    }
    if (char === ")") {
      finishCommand();
      if (context?.kind === "group") {
        current = context.outer;
        contexts.pop();
      }
      position++;
      continue;
    }
    const separator = SEPARATORS.find((candidate) => script.startsWith(candidate, position));
    if (separator !== undefined) {
      finishCommand();
      position += separator.length;
      continue;
    }
    current += char;
    position++;
  }
  finishCommand();
  return commands.filter((command) => command !== "");
}

function afterHeredocBodies(script: string, start: number, delimiters: readonly string[]): number {
  let position = start;
  for (const delimiter of delimiters) {
    while (position < script.length) {
      const lineEnd = script.indexOf("\n", position);
      const line = script.slice(position, lineEnd === -1 ? script.length : lineEnd);
      position = lineEnd === -1 ? script.length : lineEnd + 1;
      if (line.trim() === delimiter) break;
    }
  }
  return position;
}
