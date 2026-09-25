import { describe, expect, it } from "vitest";
import { execProgram } from "./exec";

describe("execProgram", () => {
  it("по таймауту обрывает зависшую программу и возвращает ненулевой код", async () => {
    const startedAt = Date.now();

    const result = await execProgram(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], { timeoutMs: 200 });

    expect(result.code).not.toBe(0);
    expect(Date.now() - startedAt).toBeLessThan(5000);
  });
});
