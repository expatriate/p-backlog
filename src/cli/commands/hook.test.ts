import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readJournal } from "../../core/store/journal";
import { gitCommitAll, writeFiles } from "../../core/store/testing/temp-dirs";
import { EXIT } from "../io";
import { makeCliSandbox } from "../testing/cli-harness";

describe("backlog hook stop", () => {
  it("просит перепроверить задачи, чей код менялся", async () => {
    const { run, repo, root } = await makeCliSandbox();
    await writeFiles(repo, { "src/a.ts": "1\n" });
    gitCommitAll(repo, "Начало", "2026-09-16T10:00:00Z");
    await run(["new", "--title", "Таймаут", "--source", "src/a.ts:1"]);
    await writeFile(join(repo, "src/a.ts"), "2\n");
    gitCommitAll(repo, "Поправить таймаут", "2026-09-18T10:00:00Z");
    const event = (active: boolean) => JSON.stringify({ session_id: "s", cwd: repo, hook_event_name: "Stop", stop_hook_active: active });

    const blocked = await run(["hook", "stop"], { stdin: event(false) });

    expect(blocked.code).toBe(EXIT.ok);
    expect(JSON.parse(blocked.out)).toEqual({
      decision: "block",
      reason: "Беклог spa: после последней проверки менялся код задач — SPA-1 (изменён src/a.ts). Перепроверь их по скиллу backlog, раздел «Перепроверить задачи».",
    });
    expect((await run(["hook", "stop"], { stdin: event(true) })).out).toBe("");

    const journal = await readJournal(join(root, "spa"), "spa");
    expect(journal.events).toContainEqual(expect.objectContaining({ kind: "candidate", mode: "changed", via: "check" }));
  });

  it("молчит, если событие не разобрать, у каталога нет проекта или кандидатов нет", async () => {
    const { run, repo, home } = await makeCliSandbox();
    await run(["new", "--title", "X"]);

    for (const stdin of ["не json", "{}", JSON.stringify({ cwd: home }), JSON.stringify({ cwd: repo })]) {
      expect(await run(["hook", "stop"], { stdin })).toEqual({ code: EXIT.ok, out: "", err: "" });
    }
    expect((await run(["hook", "start"])).code).toBe(EXIT.invalid);
  });

  it("показывает новую тревогу раз в день, без блокировки", async () => {
    const { run, repo, root } = await makeCliSandbox();
    await run(["new", "--title", "Упало", "--priority", "critical"], { now: new Date(2026, 8, 1, 10) });
    const stdin = JSON.stringify({ session_id: "s", cwd: repo, hook_event_name: "Stop", stop_hook_active: false });

    const first = await run(["hook", "stop"], { stdin, now: new Date(2026, 8, 17, 10) });
    const again = await run(["hook", "stop"], { stdin, now: new Date(2026, 8, 17, 18) });
    const nextDay = await run(["hook", "stop"], { stdin, now: new Date(2026, 8, 18, 10) });

    expect(JSON.parse(first.out)).toEqual({ systemMessage: "Беклог spa: Срочные задачи ждут дольше 7 дней: 1" });
    expect(again.out).toBe("");
    expect(JSON.parse(nextDay.out)).toEqual({ systemMessage: "Беклог spa: Срочные задачи ждут дольше 7 дней: 1" });
    expect(JSON.parse(await readFile(join(root, "spa", "signals-shown.json"), "utf8"))).toEqual({ "urgent-stale": "2026-09-18" });
  });

  it("вместе с кандидатами — и блокировка, и сообщение", async () => {
    const { run, repo } = await makeCliSandbox();
    await writeFiles(repo, { "src/a.ts": "1\n" });
    gitCommitAll(repo, "Начало", "2026-09-01T10:00:00Z");
    await run(["new", "--title", "Упало", "--priority", "critical", "--source", "src/a.ts:1"], { now: new Date("2026-09-01T10:00:00Z") });
    await writeFile(join(repo, "src/a.ts"), "2\n");
    gitCommitAll(repo, "Правка", "2026-09-16T10:00:00Z");
    const stdin = JSON.stringify({ session_id: "s", cwd: repo, hook_event_name: "Stop", stop_hook_active: false });

    const result = JSON.parse((await run(["hook", "stop"], { stdin })).out) as Record<string, string>;

    expect(result.decision).toBe("block");
    expect(result.systemMessage).toBe("Беклог spa: Срочные задачи ждут дольше 7 дней: 1");
  });

  it("нечитаемый журнал не роняет хук: тревог нет, предупреждение в stderr", async () => {
    const { run, repo, root } = await makeCliSandbox();
    await run(["new", "--title", "Упало", "--priority", "critical"], { now: new Date("2026-09-01T10:00:00Z") });
    await rm(join(root, "spa", "journal.jsonl"));
    await mkdir(join(root, "spa", "journal.jsonl"));
    const stdin = JSON.stringify({ session_id: "s", cwd: repo, hook_event_name: "Stop", stop_hook_active: false });

    const result = await run(["hook", "stop"], { stdin });

    expect(result.code).toBe(EXIT.ok);
    expect(result.out).toBe("");
    expect(result.err).toContain("Не удалось посчитать тревоги");
  });
});
