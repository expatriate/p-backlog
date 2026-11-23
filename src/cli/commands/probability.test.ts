import { describe, expect, it } from "vitest";
import { EXIT } from "../io";
import { makeCliSandbox } from "../testing/cli-harness";

describe("backlog probability", () => {
  it("отличает вероятность 0% от отсутствия оценки при фильтрации", async () => {
    const { run } = await makeCliSandbox();
    expect((await run(["new", "--category", "bug", "--title", "Таймаут"])).code).toBe(EXIT.ok);
    const created = await run(["new", "--category", "bug", "--title", "Дубликат", "--probability", "0", "--json"]);
    expect(created.code).toBe(EXIT.ok);
    expect(JSON.parse(created.out)).toMatchObject({ id: "SPA-2", probability: 0 });

    const list = async (range: string): Promise<unknown> => {
      const result = await run(["list", "--probability", range, "--json"]);
      expect(result.code).toBe(EXIT.ok);
      return JSON.parse(result.out);
    };
    expect(await list("..0")).toEqual([expect.objectContaining({ id: "SPA-2", probability: 0 })]);
    expect(await list("none")).toEqual([expect.objectContaining({ id: "SPA-1" })]);

    expect((await run(["probability", "SPA-1", "100"])).code).toBe(EXIT.ok);
    expect(await list("100..")).toEqual([expect.objectContaining({ id: "SPA-1", probability: 100 })]);
    expect((await run(["probability", "SPA-2", "none"])).code).toBe(EXIT.ok);
    expect(await list("0..100")).toEqual([expect.objectContaining({ id: "SPA-1", probability: 100 })]);
    expect(await list("none")).toEqual([expect.objectContaining({ id: "SPA-2" })]);
  });

  it("отклоняет неверную вероятность без записи в беклог", async () => {
    const { run } = await makeCliSandbox();
    expect((await run(["new", "--category", "bug", "--title", "Таймаут", "--probability", "0"])).code).toBe(EXIT.ok);
    expect((await run(["new", "--category", "bug", "--title", "Дубликат", "--probability", "101"])).code).toBe(EXIT.invalid);
    expect((await run(["probability", "SPA-1", "1.5"])).code).toBe(EXIT.invalid);
    expect((await run(["list", "--probability", "90..10"])).code).toBe(EXIT.invalid);

    const result = await run(["list", "--json"]);
    expect(result.code).toBe(EXIT.ok);
    expect(JSON.parse(result.out)).toEqual([expect.objectContaining({ id: "SPA-1", probability: 0 })]);
  });
});
