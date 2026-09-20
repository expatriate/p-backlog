import { describe, expect, it } from "vitest";
import { makeTask } from "../model/testing/make-task";
import { anchorOf } from "./anchor";
import { codeReview, duplicateCandidates, isReviewable, noSourceCandidates, sourcePath } from "./candidates";
import type { Task } from "../model/types";
import type { Commit, RepoFacts } from "./repo-facts";

const CREATED = "2026-09-11T10:00:00+03:00";

const codeCandidates = (tasks: readonly Task[], repoFacts: RepoFacts) => codeReview(tasks, repoFacts).candidates;

function commit(sha: string, date: string, files: Commit["files"]): Commit {
  return { sha, date, subject: `Коммит ${sha}`, files };
}

function facts(overrides: Partial<RepoFacts>): RepoFacts {
  return { isGit: true, commits: [], dirtyModifiedAt: new Map(), existing: new Set(), texts: new Map(), ...overrides };
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

  it("путь нормализуется: без ./ в начале и / в конце", () => {
    expect(sourcePath("./src/a.ts:3")).toBe("src/a.ts");
    expect(sourcePath("src/shared/")).toBe("src/shared");
    expect(sourcePath("./src/shared/")).toBe("src/shared");
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

  it("source-каталог: считаются коммиты и незакоммиченные правки файлов внутри него", () => {
    const folder = makeTask({ id: "SPA-3", title: "Модель", created: CREATED, source: "src/shared" });
    const existing = new Set(["src/shared"]);
    const commits = [
      commit("c3", "2026-09-14T10:00:00+03:00", [{ path: "src/lib/old.ts", renamedFrom: "src/shared/old.ts" }]),
      commit("b2", "2026-09-13T10:00:00+03:00", [{ path: "src/shared-extra/b.ts" }]),
      commit("a1", "2026-09-12T10:00:00+03:00", [{ path: "src/shared/model/a.ts" }]),
    ];

    expect(codeCandidates([folder], facts({ commits, existing }))).toEqual([
      {
        kind: "source-changed",
        task: { id: "SPA-3", title: "Модель" },
        path: "src/shared",
        commits: [
          { sha: "c3", subject: "Коммит c3" },
          { sha: "a1", subject: "Коммит a1" },
        ],
        uncommitted: false,
      },
    ]);

    const dirty = new Map([["src/shared/model/a.ts", Date.parse("2026-09-12T10:00:00Z")]]);
    expect(codeCandidates([folder], facts({ existing, dirtyModifiedAt: dirty }))).toMatchObject([
      { kind: "source-changed", path: "src/shared", commits: [], uncommitted: true },
    ]);
    const dirtyNeighbour = new Map([["src/shared-extra/b.ts", Date.parse("2026-09-12T10:00:00Z")]]);
    expect(codeCandidates([folder], facts({ existing, dirtyModifiedAt: dirtyNeighbour }))).toEqual([]);
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

  it("одно место в source сравнивается по нормализованному пути и той же строке", () => {
    const dotted = makeTask({ id: "SPA-3", title: "Очередь", source: "./src/queue.ts:40", created: CREATED });
    const plain = makeTask({ id: "SPA-4", title: "Повтор", source: "src/queue.ts:40", created: CREATED });
    const otherLine = makeTask({ id: "SPA-5", title: "Кэш", source: "src/queue.ts:41", created: CREATED });

    expect(duplicateCandidates([dotted, plain, otherLine])).toEqual([
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

describe("якорь фрагмента в проверке", () => {
  const text = ["const alpha = 1;", "const beta = 2;", "const gamma = 3;", "const delta = 4;", "const epsilon = 5;", "const zeta = 6;", "const eta = 7;"].join("\n");
  const anchored = makeTask({ id: "SPA-5", title: "Якорь", created: CREATED, source: "src/a.ts:4", anchor: anchorOf(text, "src/a.ts:4") ?? "" });
  const laterCommit = [commit("e5", "2026-09-15T10:00:00+03:00", [{ path: "src/a.ts" }])];
  const withText = (content: string) => facts({ commits: laterCommit, existing: new Set(["src/a.ts"]), texts: new Map([["src/a.ts", content]]) });

  it("фрагмент на месте — не кандидат, хотя файл менялся", () => {
    expect(codeReview([anchored], withText(text.replace("alpha", "ALPHA")))).toEqual({ candidates: [], plans: [] });
  });

  it("фрагмент сдвинулся — не кандидат, source и якорь переносятся", () => {
    const shiftedText = ["// a", "// b", text].join("\n");

    expect(codeReview([anchored], withText(shiftedText))).toEqual({
      candidates: [],
      plans: [{ id: "SPA-5", changes: { source: "src/a.ts:6", anchor: anchorOf(shiftedText, "src/a.ts:6") }, note: "SPA-5: source сдвинулся :4 → :6" }],
    });
  });

  it("фрагмент изменился — кандидат, даже без коммитов после отметки", () => {
    const changed = facts({ existing: new Set(["src/a.ts"]), texts: new Map([["src/a.ts", text.replace("delta", "DELTA")]]) });

    expect(codeCandidates([anchored], changed)).toMatchObject([{ kind: "source-changed", task: { id: "SPA-5" }, commits: [], uncommitted: false }]);
  });

  it("задача без якоря или с якорем от другой строки, код не менялся — получает якорь по текущему source", () => {
    const verified = "2026-09-16T10:00:00+03:00";
    const plain = makeTask({ id: "SPA-6", title: "Без якоря", created: CREATED, verified, source: "src/a.ts:4" });
    const handEdited = makeTask({ id: "SPA-7", title: "Правка руками", created: CREATED, verified, source: "src/a.ts:6", anchor: anchored.anchor });

    expect(codeReview([plain, handEdited], withText(text))).toEqual({
      candidates: [],
      plans: [
        { id: "SPA-6", changes: { anchor: anchorOf(text, "src/a.ts:4") } },
        { id: "SPA-7", changes: { anchor: anchorOf(text, "src/a.ts:6") } },
      ],
    });
  });
});
