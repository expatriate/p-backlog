export function suppressSqliteExperimentalWarning(): void {
  const previousListeners = [...process.listeners("warning")] as ((warning: Error) => void)[];
  process.removeAllListeners("warning");
  process.on("warning", (warning: Error) => {
    if (isSqliteExperimentalWarning(warning)) return;
    for (const listener of previousListeners) listener.call(process, warning);
  });
}

function isSqliteExperimentalWarning(warning: Error): boolean {
  return warning.name === "ExperimentalWarning" && warning.message.includes("SQLite");
}
