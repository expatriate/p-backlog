import { describe, expect, it } from "vitest";
import { makeTask } from "../model/testing/make-task";
import type { Task } from "../model/types";
import { duplicateCandidates, findSimilarTask, type SymbolOf } from "./duplicates";

const CREATED = "2026-09-11T10:00:00+03:00";

type Shape = Pick<Task, "title"> & Partial<Pick<Task, "source">>;

function candidateMatches([older, newer]: readonly [Shape, Shape], symbolOf?: SymbolOf): string[] {
  const tasks = [makeTask({ id: "SPA-1", created: CREATED, ...older }), makeTask({ id: "SPA-2", created: CREATED, ...newer })];
  return duplicateCandidates(tasks, symbolOf).flatMap((candidate) => (candidate.kind === "duplicate" ? [candidate.match] : []));
}

function refusal([older, draft]: readonly [Shape, Shape]): string | null {
  return findSimilarTask(draft, [makeTask({ id: "SPA-1", created: CREATED, ...older })])?.match ?? null;
}

describe("duplicateCandidates и findSimilarTask", () => {
  it("общие слова в заголовках задач из разных файлов — не дубль: ни кандидат проверки, ни отказ new", () => {
    const pairs: [Shape, Shape][] = [
      [
        { title: "Мелочи ревью кодовой базы: сервер и веб-статистика", source: "src/server/stats-api.ts:96" },
        { title: "Мелочи ревью кодовой базы: статистика, проверка и код", source: "src/core/stats/types.ts:126" },
      ],
      [
        { title: "Мелочи ревью: CLI", source: "src/cli/commands/hook.ts:36" },
        { title: "Мелочи ревью: веб-интерфейс", source: "src/web/app/queries.ts:103" },
      ],
      [
        { title: "Ошибка обновления списка задач прячет уже загруженную таблицу", source: "src/web/list/TaskListPage.tsx:203" },
        { title: "Ошибка обновления статистики прячет уже загруженные данные", source: "src/web/stats/StatsTabState.tsx:50" },
      ],
    ];

    expect(pairs.map((pair) => ({ check: candidateMatches(pair), refusal: refusal(pair) }))).toEqual(pairs.map(() => ({ check: [], refusal: null })));
  });

  it("одно место, одна функция или один файл с непохожими заголовками — не дубль: там часто живут разные проблемы", () => {
    const samePlace: [Shape, Shape] = [
      { title: "Марка, слитая с моделью без пробела, не распознаётся", source: "src/parse/extract.py:353" },
      { title: "Разбор обрезает модель на точке объёма двигателя", source: "src/parse/extract.py:353" },
    ];
    const sameSymbol: [Shape, Shape] = [
      { title: "Модалки операций отправляются повторно и дублируют операции", source: "src/ops/use-operation.ts:48" },
      { title: "Диалог перемещения предлагает папку внутрь самой себя", source: "src/ops/use-operation.ts:51" },
    ];
    const sameFile: [Shape, Shape] = [
      { title: "Очередь", source: "src/queue.ts:1" },
      { title: "Повтор", source: "src/queue.ts:40" },
    ];

    expect(candidateMatches(samePlace)).toEqual([]);
    expect(refusal(samePlace)).toBeNull();
    expect(candidateMatches(sameSymbol, () => "src/ops/use-operation.ts::useOperation")).toEqual([]);
    expect(candidateMatches(sameFile)).toEqual([]);
  });

  it("настоящие дубли находятся: повтор с тем же заголовком и местом, пересказ в том же файле, тот же заголовок без source", () => {
    const retry: [Shape, Shape] = [
      { title: "Мелочи ревью: тесты проверяют реализацию, а не поведение", source: "src/api/mapper.spec.ts:48" },
      { title: "Мелочи ревью: тесты проверяют реализацию, а не поведение", source: "src/api/mapper.spec.ts:48" },
    ];
    const retold: [Shape, Shape] = [
      { title: "Клик по пункту меню хлебных крошек делает два перехода: к родителю и к выбранной папке", source: "src/nav/FolderNavigation.tsx:60" },
      { title: "В выпадающем списке навигации любой пункт ведёт к родителю текущей папки, а не к выбранному", source: "src/nav/FolderNavigation.tsx:58" },
    ];
    const sameTitle: [Shape, Shape] = [{ title: "Таймаут загрузки не учитывает размер файла" }, { title: "Загрузка: таймаут не учитывает размер файла" }];

    expect([retry, retold, sameTitle].map((pair) => ({ check: candidateMatches(pair), refusal: refusal(pair) }))).toEqual([
      { check: ["source"], refusal: "source" },
      { check: ["title"], refusal: "title" },
      { check: ["title"], refusal: "title" },
    ]);
  });

  it("похожие заголовки в одной функции — дубль по символу, даже когда строки разные; в разных функциях одного файла — по заголовку", () => {
    const stalled = makeTask({ id: "SPA-3", title: "Очередь отправки висит после обрыва сети", source: "src/queue.ts:12", created: CREATED });
    const frozen = makeTask({ id: "SPA-4", title: "Очередь отправки зависает при обрыве сети", source: "src/queue.ts:20", created: CREATED });
    const oneSymbol = () => "src/queue.ts::drainQueue";
    const ownSymbol = (task: Task) => (task.source === "src/queue.ts:12" ? "src/queue.ts::drainQueue" : "src/queue.ts::retry");

    expect(duplicateCandidates([stalled, frozen], oneSymbol)).toEqual([{ kind: "duplicate", task: { id: "SPA-4", title: frozen.title }, other: { id: "SPA-3", title: stalled.title }, match: "symbol" }]);
    expect(candidateMatches([stalled, frozen], ownSymbol)).toEqual(["title"]);
  });

  it("одно место в source сравнивается по нормализованному пути и той же строке", () => {
    const dotted = makeTask({ id: "SPA-3", title: "Очередь отправки висит после обрыва сети", source: "./src/queue.ts:40", created: CREATED });
    const plain = makeTask({ id: "SPA-4", title: "Очередь отправки висит при обрыве сети", source: "src/queue.ts:40", created: CREATED });
    const otherLine = makeTask({ id: "SPA-5", title: "Очередь отправки зависает после обрыва сети", source: "src/queue.ts:41", created: CREATED });

    expect(duplicateCandidates([dotted, plain, otherLine]).map((candidate) => (candidate.kind === "duplicate" ? [candidate.task.id, candidate.other.id, candidate.match] : []))).toEqual([
      ["SPA-4", "SPA-3", "source"],
      ["SPA-5", "SPA-3", "title"],
      ["SPA-5", "SPA-4", "title"],
    ]);
  });

  it("связанные через related и подтверждённые обе после создания пары не предлагаются", () => {
    const upload = makeTask({ id: "SPA-1", title: "Таймаут загрузки не учитывает размер файла", source: "src/upload.ts:88", created: CREATED });
    const linked = makeTask({ id: "SPA-2", title: "Загрузка: таймаут не учитывает большие файлы", source: "src/upload.ts:90", related: ["SPA-1"], created: CREATED });
    expect(duplicateCandidates([upload, linked])).toEqual([]);

    const later = "2026-09-12T10:00:00+03:00";
    const confirmedA = { ...upload, verified: later };
    const confirmedB = { ...linked, related: [], verified: later };
    expect(duplicateCandidates([confirmedA, confirmedB])).toEqual([]);
    expect(duplicateCandidates([upload, confirmedB])).toHaveLength(1);
  });
});
