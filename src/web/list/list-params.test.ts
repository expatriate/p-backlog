import { describe, expect, it } from "vitest";
import { OPEN_STATUSES } from "../../core/model/query";
import { DEFAULT_SORT, pickSortKey, readListParams, writeListParams } from "./list-params";

const read = (search: string) => readListParams(new URLSearchParams(search));
const write = (search: string) => writeListParams(read(search)).toString();

describe("readListParams", () => {
  it("без параметров — открытые статусы и сортировка по дате убыванием", () => {
    expect(read("")).toEqual({
      filter: {
        query: undefined,
        statuses: OPEN_STATUSES,
        priorities: undefined,
        tags: undefined,
        epic: undefined,
        type: undefined,
        onlyUnblocked: undefined,
      },
      sort: DEFAULT_SORT,
    });
  });

  it("читает все фильтры и сортировку", () => {
    const { filter, sort } = read("q=таймаут&status=done,backlog&priority=high&tag=upload,network&epic=SPA-3&type=task&unblocked=1&sort=title&dir=asc");
    expect(filter).toEqual({
      query: "таймаут",
      statuses: ["done", "backlog"],
      priorities: ["high"],
      tags: ["upload", "network"],
      epic: "SPA-3",
      type: "task",
      onlyUnblocked: true,
    });
    expect(sort).toEqual({ key: "title", direction: "asc" });
  });

  it("status=all означает любой статус, пустой status — ни одного, epic=none — без эпика", () => {
    expect(read("status=all").filter.statuses).toBeUndefined();
    expect(read("status=").filter.statuses).toEqual([]);
    expect(read("epic=none").filter.epic).toBeNull();
  });

  it("игнорирует неизвестные значения", () => {
    expect(read("status=nope&priority=urgent&type=story&sort=weight&dir=sideways")).toEqual({
      filter: {
        query: undefined,
        statuses: OPEN_STATUSES,
        priorities: undefined,
        tags: undefined,
        epic: undefined,
        type: undefined,
        onlyUnblocked: undefined,
      },
      sort: DEFAULT_SORT,
    });
  });
});

describe("writeListParams", () => {
  it("не пишет значения по умолчанию", () => {
    expect(write("")).toBe("");
    expect(write("status=backlog,in-progress,blocked")).toBe("");
    expect(write("sort=created&dir=desc")).toBe("");
  });

  it("переживает круг чтение → запись → чтение", () => {
    const search = "q=%D1%82%D0%B0%D0%B9%D0%BC%D0%B0%D1%83%D1%82&status=done&priority=high%2Clow&tag=upload&epic=none&type=epic&unblocked=1&sort=progress&dir=asc";
    expect(read(write(search))).toEqual(read(search));
  });
});

describe("pickSortKey", () => {
  it("новое поле сортирует в его естественном направлении", () => {
    expect(pickSortKey(DEFAULT_SORT, "title")).toEqual({ key: "title", direction: "asc" });
    expect(pickSortKey(DEFAULT_SORT, "id")).toEqual({ key: "id", direction: "asc" });
    expect(pickSortKey({ key: "title", direction: "asc" }, "priority")).toEqual({ key: "priority", direction: "desc" });
  });

  it("то же поле меняет направление", () => {
    expect(pickSortKey({ key: "title", direction: "asc" }, "title")).toEqual({ key: "title", direction: "desc" });
    expect(pickSortKey(DEFAULT_SORT, "created")).toEqual({ key: "created", direction: "asc" });
  });
});
