import { rm } from "node:fs/promises";
import { join } from "node:path";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
  "spa/SPA-10.md": taskFixture("SPA-10", { title: "Загрузка файлов", type: "epic" }),
  "torg-io/project.md": projectFile("TI"),
  "torg-io/TI-1.md": taskFixture("TI-1", { title: "Каталог тормозит" }),
  "torg-io/TI-5.md": taskFixture("TI-5", { title: "Каталог", type: "epic" }),
};

function holdBatches(answer: "ok" | "server-error") {
  const { promise: released, resolve: release }: PromiseWithResolvers<void> = Promise.withResolvers();
  const beforeRender = (app: TestApp) => {
    const request = app.request;
    app.request = async (path, init) => {
      if (path !== "/api/tasks/batch") return request(path, init);
      await released;
      if (answer === "ok") return request(path, init);
      return new Response(JSON.stringify({ errors: ["EACCES: permission denied"] }), { status: 500, headers: { "content-type": "application/json" } });
    };
  };
  return { release, beforeRender };
}

function recordBatches() {
  const sent: BatchRequest[] = [];
  const beforeRender = (app: TestApp) => {
    const request = app.request;
    app.request = async (path, init) => {
      if (path === "/api/tasks/batch") sent.push(JSON.parse(String(init?.body)) as BatchRequest);
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

const panel = (name = "Действия с выбранными") => screen.getByRole("region", { name });

describe("панель массовых действий", () => {
  it("появляется только при выборе и считает задачи, скрытые фильтром", async () => {
    const app = await renderApp(FILES);
    await screen.findAllByRole("row");
    expect(screen.queryByRole("region", { name: "Действия с выбранными" })).toBeNull();

    await select(app, "SPA-1", "SPA-3", "TI-1");
    await app.user.type(screen.getByRole("searchbox", { name: "Поиск задач" }), "SPA");

    await waitFor(() => expect(within(panel()).getByRole("status").textContent).toBe("Выбрано 3 (1 скрыта фильтром)"));
  });

  it("«Закрыть как неактуальные» требует причину и закрывает выбранные с их версиями", async () => {
    const { sent, beforeRender } = recordBatches();
    const app = await renderApp(FILES, "/", undefined, { beforeRender });
    await select(app, "SPA-1", "SPA-3");
    const loadedVersions = [
      { id: "SPA-1", version: await app.taskVersion("SPA-1") },
      { id: "SPA-3", version: await app.taskVersion("SPA-3") },
    ];

    await app.user.click(within(panel()).getByRole("button", { name: "Закрыть как неактуальные" }));
    const dialog = screen.getByRole("dialog", { name: /^Закрыть 2\sзадачи как неактуальные\?$/ });
    const confirm = within(dialog).getByRole<HTMLButtonElement>("button", { name: "Закрыть 2" });
    expect(confirm.disabled).toBe(true);
    await app.user.type(within(dialog).getByRole("textbox", { name: "Причина" }), "   ");
    expect(confirm.disabled).toBe(true);

    await app.user.type(within(dialog).getByRole("textbox", { name: "Причина" }), "дубль PB-1");
    await app.user.click(confirm);

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      tasks: loadedVersions,
      action: { kind: "close", reason: "дубль PB-1" },
    });
    await waitFor(async () => {
      const closed = await taskOnDisk(app.root, "SPA-3");
      expect([closed.status, closed.resolution, closed.reason]).toEqual(["cancelled", "obsolete", "дубль PB-1"]);
    });
    await waitFor(() => expect(screen.queryByRole("region", { name: "Действия с выбранными" })).toBeNull());
  });

  it("«Приоритет» ставит выбранное значение всем выбранным", async () => {
    const { sent, beforeRender } = recordBatches();
    const app = await renderApp(FILES, "/", undefined, { beforeRender });
    await select(app, "SPA-1", "TI-1");

    await app.user.click(within(panel()).getByRole("button", { name: "Приоритет" }));
    const menu = within(panel()).getByRole("group", { name: "Приоритет" });
    expect(within(menu).getAllByRole("button").map((option) => option.textContent)).toEqual(["низкий", "средний", "высокий", "критичный"]);
    await app.user.click(within(menu).getByRole("button", { name: "критичный" }));

    await waitFor(() => expect(sent.map((request) => request.action)).toEqual([{ kind: "priority", priority: "critical" }]));
    await waitFor(async () => expect((await taskOnDisk(app.root, "TI-1")).priority).toBe("critical"));
  });

  it("«Эпик» предлагает эпики проекта выбранных задач и «Вынуть из эпика»", async () => {
    const { sent, beforeRender } = recordBatches();
    const app = await renderApp(FILES, "/", undefined, { beforeRender });
    await select(app, "SPA-1", "SPA-3");

    await app.user.click(within(panel()).getByRole("button", { name: "Эпик" }));
    const menu = within(panel()).getByRole("group", { name: "Эпик" });
    expect(within(menu).queryByText("TI-5")).toBeNull();
    await app.user.click(within(menu).getByRole("button", { name: /SPA-10/ }));
    await waitFor(async () => expect((await taskOnDisk(app.root, "SPA-3")).epic).toBe("SPA-10"));

    await select(app, "SPA-3");
    await app.user.click(within(panel()).getByRole("button", { name: "Эпик" }));
    await app.user.click(within(panel()).getByRole("button", { name: "Вынуть из эпика" }));

    await waitFor(() => expect(sent.map((request) => request.action)).toEqual([{ kind: "epic", epic: "SPA-10" }, { kind: "epic", epic: null }]));
    await waitFor(async () => expect((await taskOnDisk(app.root, "SPA-3")).epic).toBeUndefined());
  });

  it("для задач из разных проектов «Эпик» выключен с подсказкой", async () => {
    const app = await renderApp(FILES);
    await select(app, "SPA-1", "TI-1");

    const epic = within(panel()).getByRole("button", { name: "Эпик" });
    expect(epic.getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById(epic.getAttribute("aria-describedby") ?? "")?.textContent).toBe("Задачи из разных проектов");
    await app.user.click(epic);
    expect(within(panel()).queryByRole("group", { name: "Эпик" })).toBeNull();
  });

  it("«Снять выбор» снимает все галочки и убирает панель", async () => {
    const app = await renderApp(FILES);
    await select(app, "SPA-1", "SPA-3");

    await app.user.click(within(panel()).getByRole("button", { name: "Снять выбор" }));

    expect(screen.queryByRole("region", { name: "Действия с выбранными" })).toBeNull();
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: "Выбрать SPA-1" }).checked).toBe(false);
  });

  it("задача, удалённая с диска, пока была выбрана, не считается скрытой и не отправляется", async () => {
    const { sent, beforeRender } = recordBatches();
    const app = await renderApp(FILES, "/", undefined, { beforeRender });
    await select(app, "SPA-1", "SPA-3");

    await rm(join(app.root, "spa/SPA-1.md"));
    await app.emitChange();

    await waitFor(() => expect(panel().textContent).toContain("Выбрано 1"));
    expect(panel().textContent).not.toContain("скрыт");
    await app.user.click(within(panel()).getByRole("button", { name: "Приоритет" }));
    await app.user.click(within(panel()).getByRole("button", { name: "критичный" }));
    await waitFor(() => expect(sent.map((request) => request.tasks.map((task) => task.id))).toEqual([["SPA-3"]]));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Действия с выбранными" })).toBeNull());
  });

  it("по-английски", async () => {
    const app = await renderApp(FILES, "/", undefined, { language: "en" });
    await screen.findAllByRole("row");
    for (const id of ["SPA-1", "SPA-3", "TI-1"]) await app.user.click(screen.getByRole("checkbox", { name: `Select ${id}` }));
    await app.user.type(screen.getByRole("searchbox", { name: "Search tasks" }), "SPA");

    const actions = panel("Actions on selected");
    await waitFor(() => expect(actions.textContent).toContain("3 selected"));
    expect(actions.textContent).toContain("(1 hidden by filter)");
    expect(document.getElementById(within(actions).getByRole("button", { name: "Epic" }).getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Tasks from different projects",
    );
    await app.user.click(within(actions).getByRole("button", { name: "Close as obsolete" }));
    expect(within(screen.getByRole("dialog", { name: /^Close 3\stasks as obsolete\?$/ })).getByRole("button", { name: "Close 3" })).toBeDefined();
  });

  it("пока запрос в пути, меню приоритета и эпика не открываются", async () => {
    const { release, beforeRender } = holdBatches("ok");
    const app = await renderApp(FILES, "/", undefined, { beforeRender });
    await select(app, "SPA-1", "SPA-3");

    await app.user.click(within(panel()).getByRole("button", { name: "Приоритет" }));
    await app.user.click(within(panel()).getByRole("button", { name: "критичный" }));
    const epic = within(panel()).getByRole("button", { name: "Эпик" });
    await app.user.click(epic);

    expect(epic.getAttribute("aria-disabled")).toBe("true");
    expect(within(panel()).queryByRole("group", { name: "Эпик" })).toBeNull();
    release();
    await waitFor(() => expect(screen.queryByRole("region", { name: "Действия с выбранными" })).toBeNull());
  });

  it("ошибка запроса не переживает снятие выбора", async () => {
    const { release, beforeRender } = holdBatches("server-error");
    release();
    const app = await renderApp(FILES, "/", undefined, { beforeRender });
    await select(app, "SPA-1");
    await app.user.click(within(panel()).getByRole("button", { name: "Приоритет" }));
    await app.user.click(within(panel()).getByRole("button", { name: "критичный" }));
    expect(await within(panel()).findByRole("alert")).toBeDefined();

    await app.user.click(within(panel()).getByRole("button", { name: "Снять выбор" }));
    await select(app, "SPA-3");

    expect(within(panel()).queryByRole("alert")).toBeNull();
  });

  it("открытый диалог закрытия не возвращается сам, когда выбор опустел и появился снова", async () => {
    const app = await renderApp(FILES);
    await select(app, "SPA-3");
    await app.user.click(within(panel()).getByRole("button", { name: "Закрыть как неактуальные" }));
    expect(screen.getByRole("dialog")).toBeDefined();

    await rm(join(app.root, "spa/SPA-3.md"));
    await app.emitChange();
    await waitFor(() => expect(screen.queryByRole("region", { name: "Действия с выбранными" })).toBeNull());
    await select(app, "SPA-1");

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
