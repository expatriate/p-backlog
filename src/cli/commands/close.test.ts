import { rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatLocalIso } from "../../core/model/dates";
import { loadBacklog } from "../../core/store/load";
import { readJournal } from "../../core/store/journal";
import { EXIT } from "../io";
import { commitIn, makeCliSandbox, SANDBOX_NOW } from "../testing/cli-harness";

const DELETION_DAY = formatLocalIso(new Date("2026-09-24T14:50:00Z")).slice(0, 10);

async function task(root: string, id: string) {
  const found = (await loadBacklog(root)).tasks.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`нет задачи ${id}`);
  return found;
}

describe("backlog close", () => {
  it("закрывает задачу с причиной, датой закрытия и сроком удаления", async () => {
    const { run, root, repo } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Таймаут"]);
    const sha = await commitIn(repo);

    const result = await run(["close", "SPA-1", "--as", "fixed", "--reason", `Исправлено в ${sha}:\n  таймаут от размера`]);

    expect(result).toMatchObject({ code: EXIT.ok, out: `SPA-1: backlog → done (fixed). Удалится ${DELETION_DAY}` });
    expect(await task(root, "SPA-1")).toMatchObject({
      status: "done",
      resolution: "fixed",
      reason: `Исправлено в ${sha}: таймаут от размера`,
      closed: formatLocalIso(new Date("2026-09-17T14:50:00Z")),
    });
    const shown = (await run(["show", "SPA-1"])).out;
    expect(shown).toContain(`удалится ${DELETION_DAY}`);
    expect(shown).toContain(`Причина закрытия: fixed — Исправлено в ${sha}: таймаут от размера`);
  });

  it("исправленная — только с хешем коммита из репозитория проекта; без репозитория проверки нет", async () => {
    const { run, repo, home } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Таймаут"]);
    await commitIn(repo);

    const noHash = await run(["close", "SPA-1", "--as", "fixed", "--reason", "Поправил таймаут"]);
    const unknownHash = await run(["close", "SPA-1", "--as", "fixed", "--reason", "Исправлено в deadbee"]);

    expect(noHash).toMatchObject({ code: EXIT.invalid, err: 'Укажите коммит исправления: --reason "Исправлено в <sha>: …" (коммит должен быть в репозитории проекта)' });
    expect(unknownHash.code).toBe(EXIT.invalid);

    await run(["new", "--category", "bug", "--title", "Без репозитория", "--project", "spa"]);
    await rm(repo, { recursive: true, force: true });
    expect((await run(["close", "SPA-2", "--as", "fixed", "--reason", "Поправил"], { cwd: home })).code).toBe(EXIT.ok);
  });

  it("задаче, закрытой через status done, привязывает коммит, не открывая её снова", async () => {
    const { run, root, repo } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Таймаут"]);
    await run(["status", "SPA-1", "done"]);
    const sha = await commitIn(repo);
    const later = new Date(SANDBOX_NOW.getTime() + 2 * 60 * 60_000);

    const noHash = await run(["close", "SPA-1", "--as", "fixed", "--reason", "Поправил таймаут"], { now: later });
    const attached = await run(["close", "SPA-1", "--as", "fixed", "--reason", `Исправлено в ${sha}: таймаут`], { now: later });

    expect(noHash.code).toBe(EXIT.invalid);
    expect(attached).toMatchObject({ code: EXIT.ok, out: `SPA-1: done (fixed). Удалится ${DELETION_DAY}` });
    expect(await task(root, "SPA-1")).toMatchObject({ status: "done", resolution: "fixed", reason: `Исправлено в ${sha}: таймаут`, closed: formatLocalIso(SANDBOX_NOW) });
    const statusEvents = (await readJournal(join(root, "spa"), "spa")).events.filter((event) => event.kind === "status");
    expect(statusEvents).toMatchObject([{ from: "backlog", to: "done" }]);
    expect((await run(["close", "SPA-1", "--as", "fixed", "--reason", `Исправлено в ${sha}: ещё раз`], { now: later })).code).toBe(EXIT.refused);
  });

  it("пишет событие статуса в журнал проекта", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Устарело"]);

    await run(["close", "SPA-1", "--as", "obsolete", "--reason", "больше не нужно"]);

    const journal = await readJournal(join(root, "spa"), "spa");
    expect(journal.events.at(-1)).toMatchObject({ kind: "status", to: "cancelled", resolution: "obsolete", via: "cli" });
  });

  it("дубль отменяется и связывается с оригиналом", async () => {
    const { run, root } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Оригинал"]);
    await run(["new", "--category", "bug", "--title", "Дубль"]);

    const result = await run(["close", "SPA-2", "--as", "duplicate", "--duplicate-of", "SPA-1", "--reason", "то же, что SPA-1"]);

    expect(result.code).toBe(EXIT.ok);
    expect(await task(root, "SPA-2")).toMatchObject({ status: "cancelled", resolution: "duplicate", related: ["SPA-1"] });
  });

  it("отказывает закрытой задаче, эпику, неизвестным ID и неверному оригиналу", async () => {
    const { run } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Открытая"]);
    await run(["new", "--title", "Эпик", "--type", "epic"]);
    await run(["new", "--category", "bug", "--title", "Закрытая"]);
    await run(["status", "SPA-3", "done"]);

    const close = (...args: string[]) => run(["close", ...args]);
    expect((await close("SPA-3", "--as", "obsolete", "--reason", "x")).code).toBe(EXIT.refused);
    expect((await close("SPA-2", "--as", "obsolete", "--reason", "x")).code).toBe(EXIT.invalid);
    expect((await close("SPA-40", "--as", "fixed", "--reason", "x")).code).toBe(EXIT.notFound);
    expect((await close("SPA-1", "--as", "duplicate", "--duplicate-of", "SPA-40", "--reason", "x")).code).toBe(EXIT.notFound);
    const closedOriginal = await close("SPA-1", "--as", "duplicate", "--duplicate-of", "SPA-3", "--reason", "x");
    expect(closedOriginal).toMatchObject({ code: EXIT.invalid, err: "SPA-3 уже закрыта — закройте SPA-1 как fixed или obsolete" });
    expect((await close("SPA-1", "--as", "duplicate", "--duplicate-of", "SPA-1", "--reason", "x")).code).toBe(EXIT.invalid);
  });

  it("проверяет аргументы: --reason обязателен, --duplicate-of только с duplicate", async () => {
    const { run } = await makeCliSandbox();
    await run(["new", "--category", "bug", "--title", "Открытая"]);

    expect((await run(["close", "SPA-1", "--as", "fixed"])).code).toBe(EXIT.invalid);
    expect((await run(["close", "SPA-1", "--as", "fixed", "--reason", "  "])).code).toBe(EXIT.invalid);
    expect((await run(["close", "SPA-1", "--as", "duplicate", "--reason", "x"])).code).toBe(EXIT.invalid);
    expect((await run(["close", "SPA-1", "--as", "fixed", "--duplicate-of", "SPA-2", "--reason", "x"])).code).toBe(EXIT.invalid);
    expect((await run(["close", "SPA-1", "--as", "later", "--reason", "x"])).code).toBe(EXIT.invalid);
  });
});
