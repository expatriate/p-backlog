const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const DURATION = /^\d+(\.\d+)?[smhd]?$/;
const WINDOWS_EXECUTABLE = /\.(cmd|exe|ps1)$/i;
const XARGS_PLACEHOLDER = "{}";
const PACKAGE_OPTION = "--package=";
const BACKLOG_BIN = "backlog";
const BACKLOG_PACKAGE = "p-backlog";
const SHELL_KEYWORDS = new Set(["if", "then", "else", "elif", "do", "while", "until", "!", "{"]);
const WRAPPERS = new Set(["time", "sudo", "env", "timeout", "xargs", "nice", "nohup", "exec", "command"]);
const WRAPPER_VALUE_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  sudo: ["-u", "-g", "-C", "-D", "-h", "-p", "-r", "-t", "-U"],
  env: ["-u", "-C", "-S"],
  timeout: ["-s", "-k"],
  xargs: ["-I", "-n", "-L", "-P", "-s", "-d", "-E", "-a"],
  nice: ["-n"],
};
const COMMAND_LOOKUP_OPTIONS = ["-v", "-V"];
const PACKAGE_RUNNERS = new Set(["npx", "bunx", "pnpx"]);
const RUNNER_SUBCOMMANDS: Readonly<Record<string, readonly string[]>> = { pnpm: ["dlx", "exec"], yarn: ["dlx", "exec"], npm: ["exec", "x"], bun: ["x"] };
const BIN_RUNNERS = new Set(["yarn"]);

export function invokesBacklog(script: string): boolean {
  return simpleCommands(script).some((command) => {
    const [program, ...args] = programWords(command.split(/\s+/));
    if (program === undefined) return false;
    const name = executableName(program);
    if (name === BACKLOG_BIN || (BIN_RUNNERS.has(name) && args[0] === BACKLOG_BIN)) return true;
    const runnerArgs = packageRunnerArguments(name, args);
    return runnerArgs !== null && runsBacklogPackage(runnerArgs);
  });
}

function programWords(words: readonly string[]): string[] {
  let rest = dropWhile(words, (word) => word === "" || ENV_ASSIGNMENT.test(word) || SHELL_KEYWORDS.has(word));
  while (rest[0] !== undefined && WRAPPERS.has(rest[0])) rest = afterWrapper(rest[0], rest.slice(1));
  return rest;
}

function afterWrapper(wrapper: string, words: readonly string[]): string[] {
  if (wrapper === "command" && COMMAND_LOOKUP_OPTIONS.includes(words[0] ?? "")) return [];
  const valued = WRAPPER_VALUE_OPTIONS[wrapper] ?? [];
  let index = 0;
  while (index < words.length && isWrapperArgument(words[index] ?? "")) index += valued.includes(words[index] ?? "") ? 2 : 1;
  return words.slice(index);
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
  const isBacklogPackage = (spec: string | undefined) => spec === BACKLOG_PACKAGE || spec === BACKLOG_BIN || spec?.startsWith(`${BACKLOG_PACKAGE}@`) === true;
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

const SEPARATORS = ["&&", "||", ";", "|", "&", "\n", "`"];
const HEREDOC_START = /^<<-?\s*(?<quote>['"]?)(?<delimiter>[^\s'"<>;&|()]+)\k<quote>/;
const HERE_STRING = "<<<";
const ARITHMETIC_START = "$((";
const ARITHMETIC_END = "))";
const COMMAND_SUBSTITUTION = "$(";

type Context = { kind: "double" } | { kind: "group"; outer: string };

type Scan = { script: string; position: number; current: string; commands: string[]; contexts: Context[]; pendingHeredocs: string[] };

type Step = (scan: Scan) => boolean;

function simpleCommands(script: string): string[] {
  const scan: Scan = { script, position: 0, current: "", commands: [], contexts: [], pendingHeredocs: [] };
  while (scan.position < script.length) {
    if (scan.contexts.at(-1)?.kind === "double") stepInDoubleQuotes(scan);
    else stepUnquoted(scan);
  }
  finishCommand(scan);
  return scan.commands.filter((command) => command !== "");
}

function stepInDoubleQuotes(scan: Scan): void {
  const char = scan.script.charAt(scan.position);
  if (char === "\\") scan.position += 2;
  else if (char === '"') {
    scan.contexts.pop();
    scan.position++;
  } else if (!openSubstitution(scan)) scan.position++;
}

function stepUnquoted(scan: Scan): void {
  if (UNQUOTED_STEPS.some((step) => step(scan))) return;
  scan.current += scan.script.charAt(scan.position);
  scan.position++;
}

const UNQUOTED_STEPS: readonly Step[] = [
  skipSingleQuoted,
  openDoubleQuotes,
  takeEscaped,
  skipArithmetic,
  skipComment,
  takeHereString,
  startHeredoc,
  skipHeredocBodies,
  openSubstitution,
  openSubshell,
  closeGroup,
  splitAtSeparator,
];

function finishCommand(scan: Scan): void {
  scan.commands.push(scan.current.trim());
  scan.current = "";
}

function openGroup(scan: Scan, length: number): void {
  scan.contexts.push({ kind: "group", outer: scan.current });
  scan.current = "";
  scan.position += length;
}

function skipTo(scan: Scan, end: number, afterEnd: number): true {
  scan.position = end === -1 ? scan.script.length : afterEnd;
  return true;
}

function skipSingleQuoted(scan: Scan): boolean {
  if (scan.script.charAt(scan.position) !== "'") return false;
  const end = scan.script.indexOf("'", scan.position + 1);
  return skipTo(scan, end, end + 1);
}

function openDoubleQuotes(scan: Scan): boolean {
  if (scan.script.charAt(scan.position) !== '"') return false;
  scan.contexts.push({ kind: "double" });
  scan.position++;
  return true;
}

function takeEscaped(scan: Scan): boolean {
  if (scan.script.charAt(scan.position) !== "\\") return false;
  const escaped = scan.script.charAt(scan.position + 1);
  if (escaped !== "\n") scan.current += escaped;
  scan.position += 2;
  return true;
}

function skipArithmetic(scan: Scan): boolean {
  if (!scan.script.startsWith(ARITHMETIC_START, scan.position)) return false;
  const end = scan.script.indexOf(ARITHMETIC_END, scan.position + ARITHMETIC_START.length);
  return skipTo(scan, end, end + ARITHMETIC_END.length);
}

function skipComment(scan: Scan): boolean {
  if (scan.script.charAt(scan.position) !== "#" || !/(^|\s)$/.test(scan.current)) return false;
  const end = scan.script.indexOf("\n", scan.position);
  return skipTo(scan, end, end);
}

function takeHereString(scan: Scan): boolean {
  if (!scan.script.startsWith(HERE_STRING, scan.position)) return false;
  scan.current += HERE_STRING;
  scan.position += HERE_STRING.length;
  return true;
}

function startHeredoc(scan: Scan): boolean {
  const heredoc = HEREDOC_START.exec(scan.script.slice(scan.position));
  if (!heredoc) return false;
  scan.pendingHeredocs.push(heredoc.groups?.delimiter ?? "");
  scan.position += heredoc[0].length;
  return true;
}

function skipHeredocBodies(scan: Scan): boolean {
  if (scan.script.charAt(scan.position) !== "\n" || scan.pendingHeredocs.length === 0) return false;
  finishCommand(scan);
  scan.position = afterHeredocBodies(scan.script, scan.position + 1, scan.pendingHeredocs.splice(0));
  return true;
}

function openSubstitution(scan: Scan): boolean {
  if (!scan.script.startsWith(COMMAND_SUBSTITUTION, scan.position)) return false;
  openGroup(scan, COMMAND_SUBSTITUTION.length);
  return true;
}

function openSubshell(scan: Scan): boolean {
  if (scan.script.charAt(scan.position) !== "(") return false;
  openGroup(scan, 1);
  return true;
}

function closeGroup(scan: Scan): boolean {
  if (scan.script.charAt(scan.position) !== ")") return false;
  finishCommand(scan);
  const context = scan.contexts.at(-1);
  if (context?.kind === "group") {
    scan.current = context.outer;
    scan.contexts.pop();
  }
  scan.position++;
  return true;
}

function splitAtSeparator(scan: Scan): boolean {
  const separator = SEPARATORS.find((candidate) => scan.script.startsWith(candidate, scan.position));
  if (separator === undefined) return false;
  finishCommand(scan);
  scan.position += separator.length;
  return true;
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
