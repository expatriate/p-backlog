import { describe, expect, it } from "vitest";
import { formatLocalIso } from "../../core/model/dates";
import { loadBacklog } from "../../core/store/load";
import { EXIT } from "../io";
import { makeCliSandbox } from "../testing/cli-harness";

const DELETION_DAY = formatLocalIso(new Date("2026-09-24T14:50:00Z")).slice(0, 10);

async function task(root: string, id: string) {
  const found = (await loadBacklog(root)).tasks.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`нет задачи ${id}`);
  return found;
}

describe("backlog close", () => {
  it("закрывает задачу с причиной, датой закрытия и сроком удаления", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--title", "Таймаут"]);

    const result = await run(["close", "SPA-1", "--as", "fixed", "--reason", "Исправлено в a1b2c3d:\n  таймаут от размера"]);

    expect(result).toMatchObject({ code: EXIT.ok, out: `SPA-1: backlog → done (fixed). Удалится ${DELETION_DAY}` });
    expect(await task(root, "SPA-1")).toMatchObject({
      status: "done",
      resolution: "fixed",
      reason: "Исправлено в a1b2c3d: таймаут от размера",
      closed: formatLocalIso(new Date("2026-09-17T14:50:00Z")),
    });
    const shown = (await run(["show", "SPA-1"])).out;
    expect(shown).toContain(`удалится ${DELETION_DAY}`);
    expect(shown).toContain("Причина закрытия: fixed — Исправлено в a1b2c3d: таймаут от размера");
  });

  it("дубль отменяется и связывается с оригиналом", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--title", "Оригинал"]);
    await run(["new", "--title", "Дубль"]);

    const result = await run(["close", "SPA-2", "--as", "duplicate", "--duplicate-of", "SPA-1", "--reason", "то же, что SPA-1"]);

    expect(result.code).toBe(EXIT.ok);
    expect(await task(root, "SPA-2")).toMatchObject({ status: "cancelled", resolution: "duplicate", related: ["SPA-1"] });
  });

  it("отказывает закрытой задаче, эпику, неизвестным ID и неверному оригиналу", async () => {
    const { run } = await makeCliSandbox();
    await run(["new", "--title", "Открытая"]);
    await run(["new", "--title", "Эпик", "--type", "epic"]);
    await run(["new", "--title", "Закрытая"]);
    await run(["status", "SPA-3", "done"]);

    const close = (...args: string[]) => run(["close", ...args]);
    expect((await close("SPA-3", "--as", "fixed", "--reason", "x")).code).toBe(EXIT.refused);
    expect((await close("SPA-2", "--as", "obsolete", "--reason", "x")).code).toBe(EXIT.invalid);
    expect((await close("SPA-40", "--as", "fixed", "--reason", "x")).code).toBe(EXIT.notFound);
    expect((await close("SPA-1", "--as", "duplicate", "--duplicate-of", "SPA-40", "--reason", "x")).code).toBe(EXIT.notFound);
    const closedOriginal = await close("SPA-1", "--as", "duplicate", "--duplicate-of", "SPA-3", "--reason", "x");
    expect(closedOriginal).toMatchObject({ code: EXIT.invalid, err: "SPA-3 уже закрыта — закройте SPA-1 как fixed или obsolete" });
    expect((await close("SPA-1", "--as", "duplicate", "--duplicate-of", "SPA-1", "--reason", "x")).code).toBe(EXIT.invalid);
  });

  it("проверяет аргументы: --reason обязателен, --duplicate-of только с duplicate", async () => {
    const { run } = await makeCliSandbox();
    await run(["new", "--title", "Открытая"]);

    expect((await run(["close", "SPA-1", "--as", "fixed"])).code).toBe(EXIT.invalid);
    expect((await run(["close", "SPA-1", "--as", "fixed", "--reason", "  "])).code).toBe(EXIT.invalid);
    expect((await run(["close", "SPA-1", "--as", "duplicate", "--reason", "x"])).code).toBe(EXIT.invalid);
    expect((await run(["close", "SPA-1", "--as", "fixed", "--duplicate-of", "SPA-2", "--reason", "x"])).code).toBe(EXIT.invalid);
    expect((await run(["close", "SPA-1", "--as", "later", "--reason", "x"])).code).toBe(EXIT.invalid);
  });
});
