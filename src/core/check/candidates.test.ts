import { describe, expect, it } from "vitest";
import { makeTask } from "../model/testing/make-task";
import { codeCandidates, duplicateCandidates, isReviewable, noSourceCandidates, sourcePath } from "./candidates";
import type { Commit, RepoFacts } from "./repo-facts";

const CREATED = "2026-09-11T10:00:00+03:00";

function commit(sha: string, date: string, files: Commit["files"]): Commit {
  return { sha, date, subject: `Коммит ${sha}`, files };
}

function facts(overrides: Partial<RepoFacts>): RepoFacts {
  return { isGit: true, commits: [], dirtyModifiedAt: new Map(), existing: new Set(), ...overrides };
}

describe("isReviewable и sourcePath", () => {
  it("проверяются только задачи в backlog и blocked, без эпиков", () => {
    expect(isReviewable(makeTask({ id: "SPA-1" }))).toBe(true);
    expect(isReviewable(makeTask({ id: "SPA-1", status: "blocked" }))).toBe(true);
    expect(isReviewable(makeTask({ id: "SPA-1", status: "in-progress" }))).toBe(false);
    expect(isReviewable(makeTask({ id: "SPA-1", status: "done" }))).toBe(false);
    expect(isReviewable(makeTask({ id: "SPA-1", type: "epic" }))).toBe(false);
  });

  it("путь — часть source до номера строки", () => {
    expect(sourcePath("src/upload/client.ts:88")).toBe("src/upload/client.ts");
    expect(sourcePath("src/a.ts:10-20")).toBe("src/a.ts");
    expect(sourcePath("README.md")).toBe("README.md");
  });
});

describe("codeCandidates", () => {
  const task = makeTask({ id: "SPA-1", title: "Таймаут", created: CREATED, source: "src/a.ts:10" });

  it("файл менялся коммитами после создания задачи — до трёх последних коммитов", () => {
    const commits = [
      commit("e5", "2026-09-15T10:00:00+03:00", [{ path: "src/a.ts" }]),
      commit("d4", "2026-09-14T10:00:00+03:00", [{ path: "src/a.ts" }]),
      commit("c3", "2026-09-13T10:00:00+03:00", [{ path: "src/b.ts" }]),
      commit("b2", "2026-09-12T10:00:00+03:00", [{ path: "src/a.ts" }]),
      commit("a1", "2026-09-12T09:00:00+03:00", [{ path: "src/a.ts" }]),
      commit("z0", "2026-09-10T10:00:00+03:00", [{ path: "src/a.ts" }]),
    ];

    expect(codeCandidates([task], facts({ commits, existing: new Set(["src/a.ts"]) }))).toEqual([
      {
        kind: "source-changed",
        task: { id: "SPA-1", title: "Таймаут" },
        path: "src/a.ts",
        commits: [
          { sha: "e5", subject: "Коммит e5" },
          { sha: "d4", subject: "Коммит d4" },
          { sha: "b2", subject: "Коммит b2" },
        ],
        uncommitted: false,
      },
    ]);
  });

  it("незакоммиченная правка считается, только если файл менялся позже отметки", () => {
    const dirtyLater = facts({ existing: new Set(["src/a.ts"]), dirtyModifiedAt: new Map([["src/a.ts", Date.parse("2026-09-12T10:00:00Z")]]) });
    expect(codeCandidates([task], dirtyLater)).toMatchObject([{ kind: "source-changed", commits: [], uncommitted: true }]);

    const verified = { ...task, verified: "2026-09-13T10:00:00+03:00" };
    expect(codeCandidates([verified], dirtyLater)).toEqual([]);
  });

  it("коммиты до подтверждения не считаются", () => {
    const commits = [commit("b2", "2026-09-12T10:00:00+03:00", [{ path: "src/a.ts" }])];
    const verified = { ...task, verified: "2026-09-12T11:00:00+03:00" };
    expect(codeCandidates([verified], facts({ commits, existing: new Set(["src/a.ts"]) }))).toEqual([]);
  });

  it("пропавший файл — кандидат и после подтверждения; переименование прослеживается по цепочке", () => {
    const commits = [
      commit("c3", "2026-09-14T10:00:00+03:00", [{ path: "src/c.ts", renamedFrom: "src/b.ts" }]),
      commit("b2", "2026-09-13T10:00:00+03:00", [{ path: "src/b.ts", renamedFrom: "src/a.ts" }]),
    ];
    const verified = { ...task, verified: "2026-09-12T10:00:00+03:00" };

    expect(codeCandidates([verified], facts({ commits }))).toEqual([
      { kind: "source-missing", task: { id: "SPA-1", title: "Таймаут" }, path: "src/a.ts", renamedTo: "src/c.ts" },
    ]);
    expect(codeCandidates([task], facts({}))).toEqual([{ kind: "source-missing", task: { id: "SPA-1", title: "Таймаут" }, path: "src/a.ts" }]);
  });

  it("задачи без source здесь не участвуют", () => {
    expect(codeCandidates([makeTask({ id: "SPA-2" })], facts({}))).toEqual([]);
  });
});

describe("duplicateCandidates", () => {
  const upload = makeTask({ id: "SPA-1", title: "Таймаут загрузки не учитывает размер файла", created: CREATED });

  it("похожие заголовки и одно место в source; кандидат — более новая задача", () => {
    const sameTitle = makeTask({ id: "SPA-2", title: "Загрузка: таймаут не учитывает большие файлы", created: CREATED });
    const samePlaceA = makeTask({ id: "SPA-3", title: "Очередь", source: "src/queue.ts:40", created: CREATED });
    const samePlaceB = makeTask({ id: "SPA-4", title: "Повтор", source: "src/queue.ts:40", created: CREATED });

    expect(duplicateCandidates([upload, sameTitle, samePlaceA, samePlaceB])).toEqual([
      { kind: "duplicate", task: { id: "SPA-2", title: sameTitle.title }, other: { id: "SPA-1", title: upload.title }, match: "title" },
      { kind: "duplicate", task: { id: "SPA-4", title: "Повтор" }, other: { id: "SPA-3", title: "Очередь" }, match: "source" },
    ]);
  });

  it("тот же файл, но другая строка — не дубль: в большом файле много разных проблем", () => {
    const first = makeTask({ id: "SPA-3", title: "Очередь", source: "src/queue.ts:1", created: CREATED });
    const second = makeTask({ id: "SPA-4", title: "Повтор", source: "src/queue.ts:40", created: CREATED });
    expect(duplicateCandidates([first, second])).toEqual([]);
  });

  it("связанные через related и подтверждённые обе после создания пары не предлагаются", () => {
    const linked = makeTask({ id: "SPA-2", title: "Загрузка: таймаут не учитывает большие файлы", related: ["SPA-1"], created: CREATED });
    expect(duplicateCandidates([upload, linked])).toEqual([]);

    const later = "2026-09-12T10:00:00+03:00";
    const confirmedA = { ...upload, verified: later };
    const confirmedB = makeTask({ id: "SPA-2", title: "Загрузка: таймаут не учитывает большие файлы", created: CREATED, verified: later });
    expect(duplicateCandidates([confirmedA, confirmedB])).toEqual([]);
    expect(duplicateCandidates([upload, confirmedB])).toHaveLength(1);
  });
});

describe("noSourceCandidates", () => {
  it("задача без source — кандидат, только если в репозитории были коммиты после её отметки", () => {
    const task = makeTask({ id: "SPA-1", created: CREATED });
    const before = facts({ commits: [commit("a1", "2026-09-10T10:00:00+03:00", [])] });
    const after = facts({ commits: [commit("b2", "2026-09-12T10:00:00+03:00", [])] });

    expect(noSourceCandidates([task], before)).toEqual([]);
    expect(noSourceCandidates([task], after)).toEqual([{ kind: "no-source", task: { id: "SPA-1", title: task.title } }]);
    expect(noSourceCandidates([{ ...task, verified: "2026-09-13T10:00:00+03:00" }], after)).toEqual([]);
    expect(noSourceCandidates([{ ...task, source: "src/a.ts" }], after)).toEqual([]);
  });
});
