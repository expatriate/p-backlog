import { describe, expect, it } from "vitest";
import { loadBacklog } from "../../core/store/load";
import { EXIT } from "../io";
import { makeCliSandbox } from "../testing/cli-harness";

describe("backlog status", () => {
  it("меняет статус и предупреждает о неотмеченных пунктах при done", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--title", "X"], { stdin: "- [ ] a\n- [x] b" });

    const result = await run(["status", "SPA-1", "done"]);

    expect(result).toEqual({ code: EXIT.ok, out: "SPA-1: backlog → done", err: "Внимание: не отмечено пунктов чеклиста — 1" });
    expect((await loadBacklog(root)).tasks[0]?.status).toBe("done");
  });

  it("проверяет аргументы и существование задачи", async () => {
    const { run } = await makeCliSandbox();
    await run(["new", "--title", "X"]);
    expect((await run(["status", "SPA-1"])).code).toBe(EXIT.invalid);
    expect((await run(["status", "SPA-1", "later"])).code).toBe(EXIT.invalid);
    expect((await run(["status", "SPA-8", "done"])).code).toBe(EXIT.notFound);
  });
});
