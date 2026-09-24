import { describe, expect, it, onTestFinished, vi } from "vitest";
import { suppressSqliteExperimentalWarning } from "./sqlite-warning";

function flushWarnings(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("suppressSqliteExperimentalWarning", () => {
  it("глушит именно ExperimentalWarning про SQLite, остальные предупреждения печатаются один раз как обычно", async () => {
    const originalListeners = [...process.listeners("warning")] as ((warning: Error) => void)[];
    const written: string[] = [];
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });
    onTestFinished(() => {
      stderr.mockRestore();
      process.removeAllListeners("warning");
      for (const listener of originalListeners) process.on("warning", listener);
    });

    suppressSqliteExperimentalWarning();
    process.emitWarning("SQLite is an experimental feature and might change at any time", "ExperimentalWarning");
    process.emitWarning("устаревший способ вызова", "DeprecationWarning");
    await flushWarnings();

    const output = written.join("");
    expect(output).not.toContain("SQLite");
    expect(output).toContain("DeprecationWarning");
    expect(output.match(/DeprecationWarning/g)).toHaveLength(1);
  });
});
