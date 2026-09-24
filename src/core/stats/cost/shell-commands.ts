const SEPARATORS = ["&&", "||", "$(", ";", "|", "&", "\n", "(", ")", "`"];
const HEREDOC_START = /^<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/;
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const BACKLOG_BIN = "backlog";
const BACKLOG_PACKAGE = "p-backlog";

export function invokesBacklog(script: string): boolean {
  return simpleCommands(script).some((command) => {
    const words = command.split(/\s+/).filter((word) => !ENV_ASSIGNMENT.test(word));
    const [program, ...args] = words;
    if (program === BACKLOG_BIN) return true;
    return program === "npx" && args.find((arg) => !arg.startsWith("-")) === BACKLOG_PACKAGE;
  });
}

function simpleCommands(script: string): string[] {
  const commands: string[] = [];
  const pendingHeredocs: string[] = [];
  let current = "";
  let quote: string | null = null;
  let position = 0;
  const finishCommand = () => {
    commands.push(current.trim());
    current = "";
  };
  while (position < script.length) {
    const char = script.charAt(position);
    if (quote !== null) {
      if (char === "\\" && quote === '"') position++;
      else if (char === quote) quote = null;
      position++;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      position++;
      continue;
    }
    if (char === "\\") {
      position += 2;
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
