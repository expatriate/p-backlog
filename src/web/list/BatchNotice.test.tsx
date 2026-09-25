import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { BatchRequest } from "../../core/api/contract";
import { loadBacklog } from "../../core/store/load";
import { projectFile } from "../../core/store/testing/temp-dirs";
import type { TestApp } from "../../server/testing/test-app";
import { taskFixture } from "../testing/fixtures";
import { renderApp, type RenderedApp } from "../testing/render-app";

const FILES = {
  "spa/project.md": projectFile("SPA"),
  "spa/SPA-1.md": taskFixture("SPA-1", { title: "Таймауты загрузки", priority: "high", epic: "SPA-10" }),
  "spa/SPA-3.md": taskFixture("SPA-3", { title: "Разобрать очередь", priority: "low" }),
  "spa/SPA-7.md": taskFixture("SPA-7", { title: "Кэш превью" }),
  "spa/SPA-10.md": taskFixture("SPA-10", { title: "Загрузка файлов", type: "epic" }),
};

type FailWhen = (body: BatchRequest, attempt: number) => boolean;

function recordBatches(failWhen: FailWhen = () => false) {
  const sent: BatchRequest[] = [];
  const beforeRender = (app: TestApp) => {
    const request = app.request;
    app.request = async (path, init) => {
      if (path !== "/api/tasks/batch") return request(path, init);
      const body = JSON.parse(String(init?.body)) as BatchRequest;
      sent.push(body);
      if (failWhen(body, sent.length)) {
        return new Response(JSON.stringify({ errors: ["EACCES: permission denied"] }), { status: 500, headers: { "content-type": "application/json" } });
      }
      return request(path, init);
    };
  };
  return { sent, beforeRender };
}

async function taskOnDisk(root: string, id: string) {
  const task = (await loadBacklog(root)).tasks.find((candidate) => candidate.id === id);
  if (!task) throw new Error(`нет задачи ${id}`);
  return task;
}

async function select(app: RenderedApp, ...ids: string[]) {
  await screen.findAllByRole("row");
  for (const id of ids) await app.user.click(screen.getByRole("checkbox", { name: `Выбрать ${id}` }));
}

async function changeBehindTheList(app: RenderedApp, id: string) {
  await app.json(`/api/tasks/${id}`, "PATCH", { version: await app.taskVersion(id), changes: { title: "Правка агента" } });
}

async function closeSelected(app: RenderedApp, reason: string) {
  const panel = screen.getByRole("region", { name: "Действия с выбранными" });
  await app.user.click(within(panel).getByRole("button", { name: "Закрыть как неактуальные" }));
  const dialog = screen.getByRole("dialog");
  await app.user.type(within(dialog).getByRole("textbox", { name: "Причина" }), reason);
  await app.user.click(within(dialog).getByRole("button", { name: /^Закрыть \d+$/ }));
}

async function renderManyAndRaisePriority(beforeRender: (app: TestApp) => void) {
  const many = Object.fromEntries(Array.from({ length: 520 }, (_, index) => [`spa/SPA-${index + 1}.md`, taskFixture(`SPA-${index + 1}`, { priority: "low" })]));
  const app = await renderApp({ "spa/project.md": projectFile("SPA"), ...many }, "/", undefined, { beforeRender });
  await screen.findAllByRole("row");
  await app.user.click(screen.getByRole("checkbox", { name: "Выбрать все видимые" }));
  await app.user.type(screen.getByRole("searchbox", { name: "Поиск задач" }), "SPA-520");
  const panel = screen.getByRole("region", { name: "Действия с выбранными" });
  await app.user.click(within(panel).getByRole("button", { name: "Приоритет" }));
  await app.user.click(within(panel).getByRole("button", { name: "критичный" }));
  return app;
}

async function findNotice(summary: string) {
  const text = await screen.findByText(summary);
  const notice = text.closest<HTMLElement>('[role="status"]');
  if (!notice) throw new Error(`«${summary}» не в role="status"`);
  return notice;
}

const noticeWith = (summary: string) => screen.queryByText(summary)?.closest('[role="status"]') ?? null;

describe("уведомление об итоге массового действия", () => {
  it("после закрытия снимает выбор, считает закрытые и даёт открыть пропущенную задачу", async () => {
    const app = await renderApp(FILES);
    await select(app, "SPA-1", "SPA-3", "SPA-7");
    await changeBehindTheList(app, "SPA-7");

    await closeSelected(app, "дубль");

    const notice = await findNotice("Закрыто 2 из 3");
    expect(screen.queryByRole("region", { name: "Действия с выбранными" })).toBeNull();
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: "Выбрать SPA-1" }).checked).toBe(false);
    await app.user.click(within(notice).getByRole("link", { name: "SPA-7 изменилась на диске" }));
    expect(app.route()).toBe("/t/SPA-7");
  });

  it("«Отменить» с клавиатуры возвращает сделанные задачи по новым версиям и показывает итог без повторной отмены", async () => {
    const { sent, beforeRender } = recordBatches();
    const app = await renderApp(FILES, "/", undefined, { beforeRender });
    await select(app, "SPA-1", "SPA-3", "SPA-7");
    await changeBehindTheList(app, "SPA-7");
    await closeSelected(app, "дубль");

    const notice = await findNotice("Закрыто 2 из 3");
    const undo = within(notice).getByRole("button", { name: "Отменить" });
    expect(document.activeElement).toBe(undo);
    const closedVersions = [
      { id: "SPA-1", version: await app.taskVersion("SPA-1") },
      { id: "SPA-3", version: await app.taskVersion("SPA-3") },
    ];
    await app.user.keyboard("{Enter}");

    await findNotice("Возвращено 2 из 2");
    expect(sent[1]).toEqual({
      tasks: closedVersions,
      action: {
        kind: "restore",
        changes: {
          "SPA-1": { status: "backlog", priority: "high", epic: "SPA-10", resolution: null, reason: null },
          "SPA-3": { status: "backlog", priority: "low", epic: null, resolution: null, reason: null },
        },
      },
    });
    const restored = await taskOnDisk(app.root, "SPA-1");
    expect([restored.status, restored.resolution, restored.reason]).toEqual(["backlog", undefined, undefined]);
    expect(within(noticeWith("Возвращено 2 из 2") as HTMLElement).queryByRole("button", { name: "Отменить" })).toBeNull();
    expect(noticeWith("Возвращено 2 из 2")?.contains(document.activeElement)).toBe(true);
  });

  it("приоритет и эпик — «Изменено», с числом в нужной форме, и «Отменить» возвращает прежние значения", async () => {
    const app = await renderApp(FILES);
    await select(app, "SPA-3");
    const panel = screen.getByRole("region", { name: "Действия с выбранными" });
    await app.user.click(within(panel).getByRole("button", { name: "Приоритет" }));
    await app.user.click(within(panel).getByRole("button", { name: "критичный" }));
    await app.user.click(within(await findNotice("Изменена 1 из 1")).getByRole("button", { name: "Отменить" }));
    await findNotice("Возвращена 1 из 1");
    expect((await taskOnDisk(app.root, "SPA-3")).priority).toBe("low");

    await select(app, "SPA-1", "SPA-3");
    await app.user.click(within(screen.getByRole("region", { name: "Действия с выбранными" })).getByRole("button", { name: "Эпик" }));
    await app.user.click(screen.getByRole("button", { name: "Вынуть из эпика" }));
    const epicNotice = await findNotice("Изменено 2 из 2");
    expect((await taskOnDisk(app.root, "SPA-1")).epic).toBeUndefined();
    await app.user.click(within(epicNotice).getByRole("button", { name: "Отменить" }));
    await findNotice("Возвращено 2 из 2");
    expect((await taskOnDisk(app.root, "SPA-1")).epic).toBe("SPA-10");
  });

  it("больше 500 выбранных уходят частями по 500, итог и отмена — общие на все", { timeout: 20_000 }, async () => {
    const { sent, beforeRender } = recordBatches();
    const app = await renderManyAndRaisePriority(beforeRender);

    const notice = await findNotice("Изменено 520 из 520");
    expect(sent.map((request) => request.tasks.length)).toEqual([500, 20]);
    await app.user.click(within(notice).getByRole("button", { name: "Отменить" }));

    await findNotice("Возвращено 520 из 520");
    expect(sent.slice(2).map((request) => [request.tasks.length, request.action.kind === "restore" && Object.keys(request.action.changes).length])).toEqual([
      [500, 500],
      [20, 20],
    ]);
    expect((await taskOnDisk(app.root, "SPA-520")).priority).toBe("low");
  });

  it("сбой второй части: итог и отмена сделанной части остаются, ошибка видна", { timeout: 20_000 }, async () => {
    const { sent, beforeRender } = recordBatches((_, attempt) => attempt === 2);
    const app = await renderManyAndRaisePriority(beforeRender);

    const notice = await findNotice("Изменено 500 из 520");
    expect(within(notice).getByRole("alert").textContent).toContain("Не изменено 20 задач");
    await app.user.click(within(notice).getByRole("button", { name: "Отменить" }));

    await findNotice("Возвращено 500 из 500");
    expect(sent[2]?.tasks.length).toBe(500);
    expect((await taskOnDisk(app.root, "SPA-1")).priority).toBe("low");
  });

  it("сбой второй части отмены: итог возвращённых и повтор отмены для остальных", { timeout: 20_000 }, async () => {
    let failing = true;
    const { sent, beforeRender } = recordBatches((body, attempt) => failing && body.action.kind === "restore" && attempt === 4);
    const app = await renderManyAndRaisePriority(beforeRender);
    await app.user.click(within(await findNotice("Изменено 520 из 520")).getByRole("button", { name: "Отменить" }));

    const notice = await findNotice("Возвращено 500 из 520");
    expect(within(notice).getByRole("alert").textContent).toContain("Не удалось отменить");
    expect((await taskOnDisk(app.root, "SPA-520")).priority).toBe("critical");
    failing = false;
    const sentBeforeRetry = sent.length;
    await app.user.click(within(notice).getByRole("button", { name: "Отменить" }));

    await findNotice("Возвращено 520 из 520");
    expect(sent.slice(sentBeforeRetry).map((request) => request.tasks.length)).toEqual([20]);
    expect((await taskOnDisk(app.root, "SPA-520")).priority).toBe("low");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("неудавшаяся отмена видна и не переезжает в следующее уведомление", async () => {
    const { beforeRender } = recordBatches((body) => body.action.kind === "restore");
    const app = await renderApp(FILES, "/", undefined, { beforeRender });
    await select(app, "SPA-1");
    await closeSelected(app, "дубль");
    await app.user.click(within(await findNotice("Закрыта 1 из 1")).getByRole("button", { name: "Отменить" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Не удалось отменить");

    await select(app, "SPA-3");
    await closeSelected(app, "тоже");

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    await findNotice("Закрыта 1 из 1");
  });

  it("живёт 15 секунд, пока фокус не в нём", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout"] });
    onTestFinished(() => void vi.useRealTimers());
    const app = await renderApp(FILES);
    await select(app, "SPA-1");
    await closeSelected(app, "дубль");
    const undo = within(await findNotice("Закрыта 1 из 1")).getByRole("button", { name: "Отменить" });

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(noticeWith("Закрыта 1 из 1")).not.toBeNull();

    act(() => undo.blur());
    act(() => {
      vi.advanceTimersByTime(14_000);
    });
    expect(noticeWith("Закрыта 1 из 1")).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(noticeWith("Закрыта 1 из 1")).toBeNull();
  });

  it("по-английски", async () => {
    const app = await renderApp(FILES, "/", undefined, { language: "en" });
    await screen.findAllByRole("row");
    for (const id of ["SPA-1", "SPA-3", "SPA-7"]) await app.user.click(screen.getByRole("checkbox", { name: `Select ${id}` }));
    await changeBehindTheList(app, "SPA-7");
    await app.user.click(screen.getByRole("button", { name: "Close as obsolete" }));
    await app.user.type(screen.getByRole("textbox", { name: "Reason" }), "duplicate");
    await app.user.click(screen.getByRole("button", { name: "Close 3" }));

    const notice = await findNotice("Closed 2 of 3");
    within(notice).getByRole("link", { name: "SPA-7 changed on disk" });
    await app.user.click(within(notice).getByRole("button", { name: "Undo" }));
    await findNotice("Restored 2 of 2");
  });
});
