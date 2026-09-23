import { describe, expect, it } from "vitest";
import { EXIT } from "../io";
import { makeCliSandbox } from "../testing/cli-harness";

describe("backlog config language", () => {
  it("показывает, меняет и отвергает неизвестный язык", async () => {
    const { run } = await makeCliSandbox();
    expect((await run(["config", "language"])).out).toBe("ru");
    expect(await run(["config", "language", "en"])).toMatchObject({ code: EXIT.ok });
    expect((await run(["config", "language"])).out).toBe("en");
    expect((await run(["config", "language", "de"])).code).toBe(EXIT.invalid);
  });
});
