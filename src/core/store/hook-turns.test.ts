import { describe, expect, it } from "vitest";
import { claimHookTurn } from "./hook-turns";
import { makeTempDir } from "./testing/temp-dirs";
import { failOnPathError } from "./testing/path-errors";

describe("claimHookTurn", () => {
  it("из одновременных вызовов ход забирает ровно один, другой ход свободен", async () => {
    const root = await makeTempDir();
    const now = new Date("2026-09-25T10:00:00Z");

    const claims = await Promise.all(Array.from({ length: 5 }, () => claimHookTurn(root, "claude:s:t1", { now, onError: failOnPathError })));

    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(await claimHookTurn(root, "claude:s:t2", { now, onError: failOnPathError })).toBe(true);
  });

  it("тот же ключ через минуту снова свободен: одинаковый текст ответа в разных ходах не глушит хук", async () => {
    const root = await makeTempDir();

    await claimHookTurn(root, "claude:s:same", { now: new Date("2026-09-25T10:00:00Z"), onError: failOnPathError });

    expect(await claimHookTurn(root, "claude:s:same", { now: new Date("2026-09-25T10:00:30Z"), onError: failOnPathError })).toBe(false);
    expect(await claimHookTurn(root, "claude:s:same", { now: new Date("2026-09-25T10:01:30Z"), onError: failOnPathError })).toBe(true);
  });
});
