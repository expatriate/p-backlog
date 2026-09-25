import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { loadBacklog } from "../../core/store/load";
import { updateTask } from "../../core/store/testing/update-task";
import { projectFile } from "../../core/store/testing/temp-dirs";
import type { TestApp } from "../../server/testing/test-app";
import { taskFixture } from "../testing/fixtures";
import { freezeDate } from "../testing/freeze-date";
import { renderApp, type RenderedApp } from "../testing/render-app";

const FILES = {
  "spa/project.md": projectFile("SPA"),
  "spa/SPA-1.md": taskFixture(
    "SPA-1",
    { title: "Таймауты загрузки", priority: "high", tags: "[upload]", blockedBy: "[SPA-2, SPA-99]", epic: "SPA-3" },
    "Описание\n\n## Чеклист\n- [ ] первый шаг\n- [x] второй шаг",
  ),
  "spa/SPA-2.md": taskFixture("SPA-2", { title: "Блокер" }),
  "spa/SPA-3.md": taskFixture("SPA-3", { title: "Эпик загрузки", type: "epic" }),
  "spa/SPA-4.md": taskFixture("SPA-4", { title: "Связана", related: "[SPA-1]" }),
};

function holdFirstPatch() {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const sent: string[] = [];
  const beforeRender = (backlog: TestApp) => {
    const request = backlog.request;
    backlog.request = async (path, init) => {
      if (init?.method === "PATCH") {
        sent.push(path);
        if (sent.length === 1) await released;
      }
      return await request(path, init);
    };
  };
  return { beforeRender, release: () => release(), sent };
}

async function taskOnDisk(root: string, id: string) {
  const task = (await loadBacklog(root)).tasks.find((candidate) => candidate.id === id);
  if (!task) throw new Error(`нет задачи ${id}`);
  return task;
}

const CLOSED_FILES = {
  "spa/project.md": projectFile("SPA"),
  "spa/SPA-1.md": taskFixture("SPA-1", {
    title: "Таймауты загрузки",
    status: "done",
    closed: "2026-09-16T12:00:00Z",
    resolution: "fixed",
    reason: "Исправлено в a1b2c3d",
  }),
};

describe("карточка закрытой задачи", () => {
  it("показывает причину и отсчёт до удаления, «Вернуть в беклог» снимает закрытие в файле", async () => {
    freezeDate("2026-09-18T12:00:00Z");
    const app = await renderApp(CLOSED_FILES, "/p/spa/t/SPA-1");
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-1" });

    expect(within(panel).getByText(/исправлено — Исправлено в a1b2c3d/)).toBeDefined();
    expect(within(panel).getByText("удалится через 5 дн.").closest("[title]")?.getAttribute("title")).toBe("удалится 23.09");

    await app.user.click(within(panel).getByRole("button", { name: "Вернуть в беклог" }));

    await waitFor(async () => expect((await taskOnDisk(app.root, "SPA-1")).status).toBe("backlog"));
    const reopened = await taskOnDisk(app.root, "SPA-1");
    expect([reopened.closed, reopened.resolution, reopened.reason]).toEqual([undefined, undefined, undefined]);
  });

  it("в последние сутки вместо дней пишет «сегодня»", async () => {
    freezeDate("2026-09-23T06:00:00Z");
    await renderApp(CLOSED_FILES, "/p/spa/t/SPA-1");
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-1" });

    expect(within(panel).getByText("удалится сегодня")).toBeDefined();
  });

  it("срок удаления прошёл, а задача на месте — «удаление задержано», а не «сегодня»", async () => {
    freezeDate("2026-09-30T12:00:00Z");
    await renderApp(CLOSED_FILES, "/p/spa/t/SPA-1");
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-1" });

    expect(within(panel).getByText("удаление задержано")).toBeDefined();
    expect(within(panel).queryByText("удалится сегодня")).toBeNull();
  });
});

describe("карточка задачи", () => {
  it("показывает поля, связи, прогресс и предупреждения", async () => {
    await renderApp(FILES, "/p/spa/t/SPA-1");
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-1" });

    expect(within(panel).getByRole("textbox", { name: "Название задачи" })).toHaveProperty("value", "Таймауты загрузки");
    expect(within(panel).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50");
    expect(within(panel).getByText("SPA-99 не найдена")).toBeDefined();
    const blockedBy = within(panel).getByRole("region", { name: "Блокируется" });
    expect(within(blockedBy).getByText("Блокер")).toBeDefined();
    expect(within(blockedBy).getByText("не найдена")).toBeDefined();
    expect(within(panel).getByRole("heading", { level: 2, name: "Ссылаются как на связанную" })).toBeDefined();
    expect(within(panel).getByRole("heading", { level: 2, name: "Блокируется" })).toBeDefined();
  });

  it("ID в шапке карточки отмечен тоном эпика задачи", async () => {
    await renderApp(FILES, "/p/spa/t/SPA-1");
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-1" });

    expect(within(panel).getByText("SPA-1", { selector: "header *" }).getAttribute("data-epic-tone")).toBe("1");
  });

  it("связанные задачи — ссылки на их карточки, ненайденная — просто текст", async () => {
    await renderApp(FILES, "/p/spa/t/SPA-1");
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-1" });

    const blockedBy = within(panel).getByRole("region", { name: "Блокируется" });
    expect(within(blockedBy).getByRole("link", { name: "Блокер" }).getAttribute("href")).toBe("/p/spa/t/SPA-2");
    expect(within(blockedBy).getAllByRole("link")).toHaveLength(1);
    const referrers = within(panel).getByRole("region", { name: "Ссылаются как на связанную" });
    expect(within(referrers).getByRole("link", { name: "Связана" }).getAttribute("href")).toBe("/p/spa/t/SPA-4");
  });

  it("поле «Эпик» подсказывает только эпики", async () => {
    await renderApp(FILES, "/p/spa/t/SPA-2");
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-2" });

    const listId = within(panel).getByRole("combobox", { name: "Эпик" }).getAttribute("list") ?? "";
    const options = [...(document.getElementById(listId)?.querySelectorAll("option") ?? [])].map((option) => option.value);
    expect(options).toEqual(["SPA-3"]);
  });

  it("подсказки блокеров и связей не предлагают саму задачу", async () => {
    await renderApp(FILES, "/p/spa/t/SPA-2");
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-2" });

    const listId = within(panel).getByRole("combobox", { name: "Добавить в «Блокируется»" }).getAttribute("list") ?? "";
    const options = [...(document.getElementById(listId)?.querySelectorAll("option") ?? [])].map((option) => option.value);
    expect(options).not.toContain("SPA-2");
    expect(options).toContain("SPA-1");
  });

  it("Esc в поле не закрывает карточку, а сохраняет правку", async () => {
    const app = await renderApp(FILES, "/p/spa/t/SPA-1");
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-1" });

    await app.user.type(within(panel).getByRole("textbox", { name: "Название задачи" }), " и повторы");
    await app.user.keyboard("{Escape}");

    await waitFor(async () => expect((await taskOnDisk(app.root, "SPA-1")).title).toBe("Таймауты загрузки и повторы"));
    expect(screen.getByRole("complementary", { name: "Задача SPA-1" })).toBeDefined();
  });

  it("Enter в названии сохраняет его", async () => {
    const app = await renderApp(FILES, "/p/spa/t/SPA-1");
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-1" });

    await app.user.type(within(panel).getByRole("textbox", { name: "Название задачи" }), " снова{Enter}");

    await waitFor(async () => expect((await taskOnDisk(app.root, "SPA-1")).title).toBe("Таймауты загрузки снова"));
  });

  it("закрывается по Esc и возвращает на список", async () => {
    const app = await renderApp(FILES, "/p/spa/t/SPA-1");
    await screen.findByRole("complementary", { name: "Задача SPA-1" });

    await app.user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Задача SPA-1" })).toBeNull());
    expect(app.route()).toBe("/p/spa");
  });

  it("смена статуса сохраняется в файл задачи", async () => {
    const app = await renderApp(FILES, "/p/spa/t/SPA-1");
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-1" });

    await app.user.selectOptions(within(panel).getByRole("combobox", { name: "Статус" }), "in-progress");

    await waitFor(async () => expect((await taskOnDisk(app.root, "SPA-1")).status).toBe("in-progress"));
  });

  it("категория выбирается и убирается в карточке", async () => {
    const app = await renderApp(FILES, "/p/spa/t/SPA-1");
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-1" });
    const select = within(panel).getByRole("combobox", { name: "Категория" });

    await app.user.selectOptions(select, "couplers");
    await waitFor(async () => expect((await taskOnDisk(app.root, "SPA-1")).category).toBe("couplers"));

    await app.user.selectOptions(within(panel).getByRole("combobox", { name: "Категория" }), "");
    await waitFor(async () => expect((await taskOnDisk(app.root, "SPA-1")).category).toBeUndefined());
  });

  it("клик по пункту чеклиста переключает его в файле и двигает прогресс", async () => {
    const app = await renderApp(FILES, "/p/spa/t/SPA-1");
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-1" });

    await app.user.click(within(panel).getByRole("checkbox", { name: "первый шаг" }));

    await waitFor(async () => expect((await taskOnDisk(app.root, "SPA-1")).body).toContain("- [x] первый шаг"));
    await waitFor(() => expect(within(panel).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100"));
  });

  it("после сохранения не перебрасывает фокус на сам ящик", async () => {
    const app = await renderApp(FILES, "/p/spa/t/SPA-1");
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-1" });

    await app.user.click(within(panel).getByRole("checkbox", { name: "первый шаг" }));

    await waitFor(async () => expect((await taskOnDisk(app.root, "SPA-1")).body).toContain("- [x] первый шаг"));
    expect(document.activeElement).not.toBe(panel);
  });

  it("после переключения пункта с клавиатуры фокус остаётся на нём", async () => {
    const app = await renderApp(FILES, "/p/spa/t/SPA-1");
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-1" });
    const item = within(panel).getByRole("checkbox", { name: "первый шаг" });

    item.focus();
    await app.user.keyboard(" ");

    await waitFor(() => expect(within(panel).getByRole("checkbox", { name: "первый шаг" })).toHaveProperty("checked", true));
    expect(document.activeElement).toBe(within(panel).getByRole("checkbox", { name: "первый шаг" }));
  });

  it("правка тегов и названия уходит на сервер по потере фокуса", async () => {
    const app = await renderApp(FILES, "/p/spa/t/SPA-1");
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-1" });

    const title = within(panel).getByRole("textbox", { name: "Название задачи" });
    await app.user.clear(title);
    await app.user.type(title, "Новое название");
    await app.user.tab();

    await waitFor(async () => expect((await taskOnDisk(app.root, "SPA-1")).title).toBe("Новое название"));

    const tags = within(panel).getByRole("textbox", { name: "Теги через запятую" });
    await app.user.clear(tags);
    await app.user.type(tags, "Upload, Network");
    await app.user.tab();

    await waitFor(async () => expect((await taskOnDisk(app.root, "SPA-1")).tags).toEqual(["upload", "network"]));
  });

  it("неизвестный и неэпический ID показывают ошибку рядом с полем и не уходят на сервер", async () => {
    const app = await renderApp(FILES, "/p/spa/t/SPA-2");
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-2" });

    const epic = within(panel).getByRole("combobox", { name: "Эпик" });
    await app.user.type(epic, "SPA-1");
    await app.user.tab();

    const error = await within(panel).findByRole("alert");
    expect(error.textContent).toBe("SPA-1 не является эпиком");
    expect(epic.getAttribute("aria-invalid")).toBe("true");
    expect(epic.getAttribute("aria-describedby")).toBe(error.id);
    expect((await taskOnDisk(app.root, "SPA-2")).epic).toBeUndefined();
  });

  it.each([
    { id: "SPA-2", epic: "SPA-2", message: "задача не может быть своим эпиком" },
    { id: "SPA-3", epic: "SPA-5", message: "эпик не может входить в другой эпик" },
  ])("$id с эпиком $epic отклоняется у поля, как на сервере", async ({ id, epic, message }) => {
    const files = { ...FILES, "spa/SPA-5.md": taskFixture("SPA-5", { title: "Другой эпик", type: "epic" }) };
    const sentMethods: string[] = [];
    const app = await renderApp(files, `/p/spa/t/${id}`, undefined, {
      beforeRender: (backlog) => {
        const request = backlog.request;
        backlog.request = async (path, init) => {
          sentMethods.push(init?.method ?? "GET");
          return await request(path, init);
        };
      },
    });
    const panel = await screen.findByRole("complementary", { name: `Задача ${id}` });

    const field = within(panel).getByRole("combobox", { name: "Эпик" });
    await app.user.type(field, epic);
    await app.user.tab();

    const error = await within(panel).findByRole("alert");
    expect(error.textContent).toBe(message);
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(sentMethods).not.toContain("PATCH");
  });
});

describe("связи и название: ошибки у поля", () => {
  it("ID не по формату и повтор объясняются под полем «Добавить» и не уходят на сервер", async () => {
    const patches = holdFirstPatch();
    const app = await renderApp(FILES, "/p/spa/t/SPA-1", undefined, { beforeRender: patches.beforeRender });
    const blockedBy = within(await screen.findByRole("complementary", { name: "Задача SPA-1" })).getByRole("region", { name: "Блокируется" });
    const field = within(blockedBy).getByRole("combobox", { name: "Добавить в «Блокируется»" });

    await app.user.type(field, "12{Enter}");

    expect(within(blockedBy).getByRole("alert").textContent).toBe("Введите ID задачи, например SPA-12");
    expect(field).toHaveProperty("value", "12");
    expect(field.getAttribute("aria-invalid")).toBe("true");

    await app.user.clear(field);
    await app.user.type(field, " spa-2 ");
    await app.user.click(within(blockedBy).getByRole("button", { name: "Добавить" }));

    expect(within(blockedBy).getByRole("alert").textContent).toBe("SPA-2 уже в списке");
    expect(field).toHaveProperty("value", "");
    expect(patches.sent).toEqual([]);
  });

  it("отказ сервера добавить связь показан у поля, введённый ID остаётся", async () => {
    const app = await renderApp(FILES, "/p/spa/t/SPA-2");
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-2" });
    const blockedBy = within(panel).getByRole("region", { name: "Блокируется" });
    const field = within(blockedBy).getByRole("combobox", { name: "Добавить в «Блокируется»" });

    await app.user.type(field, "SPA-1{Enter}");

    expect((await within(blockedBy).findByRole("alert")).textContent).toContain("цикл блокеров");
    expect(field).toHaveProperty("value", "SPA-1");
    expect(within(panel).getAllByRole("alert")).toHaveLength(1);
  });

  it("отказ сервера у поля связей переживает сохранение другого поля и уходит, когда ввод правят", async () => {
    const app = await renderApp(FILES, "/p/spa/t/SPA-2");
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-2" });
    const blockedBy = within(panel).getByRole("region", { name: "Блокируется" });
    const field = within(blockedBy).getByRole("combobox", { name: "Добавить в «Блокируется»" });

    await app.user.type(field, "SPA-1{Enter}");
    expect((await within(blockedBy).findByRole("alert")).textContent).toContain("цикл блокеров");

    await app.user.selectOptions(within(panel).getByRole("combobox", { name: "Приоритет" }), "critical");
    await waitFor(async () => expect((await taskOnDisk(app.root, "SPA-2")).priority).toBe("critical"));
    expect(within(blockedBy).getByRole("alert").textContent).toContain("цикл блокеров");

    await app.user.clear(field);
    await app.user.type(field, "SPA-4");

    expect(within(blockedBy).queryByRole("alert")).toBeNull();
    expect(field.getAttribute("aria-invalid")).toBe("false");
  });

  it("сообщение о повторе уходит, когда этот ID убрали из списка", async () => {
    const app = await renderApp(FILES, "/p/spa/t/SPA-1");
    const blockedBy = within(await screen.findByRole("complementary", { name: "Задача SPA-1" })).getByRole("region", { name: "Блокируется" });

    await app.user.type(within(blockedBy).getByRole("combobox", { name: "Добавить в «Блокируется»" }), "SPA-2{Enter}");
    expect(within(blockedBy).getByRole("alert").textContent).toBe("SPA-2 уже в списке");

    await app.user.click(within(blockedBy).getByRole("button", { name: "Убрать SPA-2" }));

    await waitFor(async () => expect((await taskOnDisk(app.root, "SPA-1")).blockedBy).toEqual(["SPA-99"]));
    await waitFor(() => expect(within(blockedBy).queryByRole("alert")).toBeNull());
  });

  it("стёртое название возвращается и не уходит на сервер", async () => {
    const patches = holdFirstPatch();
    const app = await renderApp(FILES, "/p/spa/t/SPA-1", undefined, { beforeRender: patches.beforeRender });
    const title = within(await screen.findByRole("complementary", { name: "Задача SPA-1" })).getByRole("textbox", { name: "Название задачи" });

    await app.user.clear(title);
    await app.user.type(title, "   ");
    await app.user.tab();

    expect(title).toHaveProperty("value", "Таймауты загрузки");
    expect(patches.sent).toEqual([]);
  });
});

describe("правка агента, пока поле в фокусе", () => {
  const AGENT_FILES = { ...FILES, "spa/SPA-5.md": taskFixture("SPA-5", { title: "Эпик агента", type: "epic" }) };
  const AGENT_CHANGES = { title: "Название от агента", tags: ["agent"], epic: "SPA-5" };

  async function agentEdits(app: RenderedApp) {
    await updateTask(app.root, { id: "SPA-1", changes: AGENT_CHANGES, now: new Date(), via: "cli" });
    app.emitChange();
    await screen.findByRole("link", { name: AGENT_CHANGES.title });
  }

  it.each([
    { field: "Название задачи", role: "textbox", agentValue: "Название от агента" },
    { field: "Теги через запятую", role: "textbox", agentValue: "agent" },
    { field: "Эпик", role: "combobox", agentValue: "SPA-5" },
  ] as const)("поле «$field», в котором только стоял фокус, не откатывает правку агента при уходе из него", async ({ field, role, agentValue }) => {
    const app = await renderApp(AGENT_FILES, "/p/spa/t/SPA-1");
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-1" });

    await app.user.click(within(panel).getByRole(role, { name: field }));
    await agentEdits(app);
    await app.user.click(within(panel).getByRole("combobox", { name: "Статус" }));

    await waitFor(() => expect(within(panel).getByRole(role, { name: field })).toHaveProperty("value", agentValue));
    const onDisk = await taskOnDisk(app.root, "SPA-1");
    expect({ title: onDisk.title, tags: onDisk.tags, epic: onDisk.epic }).toEqual(AGENT_CHANGES);
  });

  it("своя правка поверх правки агента не записывается молча: сперва предупреждение, повторный уход из поля записывает", async () => {
    const app = await renderApp(AGENT_FILES, "/p/spa/t/SPA-1");
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-1" });
    const title = within(panel).getByRole("textbox", { name: "Название задачи" });

    await app.user.type(title, " и повторы");
    await agentEdits(app);
    await app.user.tab();

    expect((await within(panel).findByRole("alert")).textContent).toContain("изменилось на диске");
    expect(title).toHaveProperty("value", "Таймауты загрузки и повторы");
    expect((await taskOnDisk(app.root, "SPA-1")).title).toBe(AGENT_CHANGES.title);

    await app.user.click(title);
    await app.user.tab();

    await waitFor(async () => expect((await taskOnDisk(app.root, "SPA-1")).title).toBe("Таймауты загрузки и повторы"));
    expect((await taskOnDisk(app.root, "SPA-1")).tags).toEqual(AGENT_CHANGES.tags);
  });
});

describe("сохранения карточки идут по очереди", () => {
  it("второй пункт чеклиста, отмеченный до ответа на первый, не теряет первый", async () => {
    const patches = holdFirstPatch();
    const app = await renderApp(FILES, "/p/spa/t/SPA-1", undefined, { beforeRender: patches.beforeRender });
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-1" });

    await app.user.click(within(panel).getByRole("checkbox", { name: "первый шаг" }));
    await app.user.click(within(panel).getByRole("checkbox", { name: "второй шаг" }));
    patches.release();

    await waitFor(async () => expect((await taskOnDisk(app.root, "SPA-1")).body).toContain("- [ ] второй шаг"));
    expect((await taskOnDisk(app.root, "SPA-1")).body).toContain("- [x] первый шаг");
    expect(within(panel).queryByRole("alert")).toBeNull();
  });
});

describe("черновик описания при уходе с задачи", () => {
  const LEAVE = "Уйти без сохранения описания?";

  function stubConfirm(answer: boolean) {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(answer);
    onTestFinished(() => confirm.mockRestore());
    return confirm;
  }

  async function startDraft(app: RenderedApp) {
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-1" });
    await app.user.click(within(panel).getByRole("button", { name: "Редактировать описание" }));
    await app.user.type(within(panel).getByRole("textbox", { name: "Описание задачи" }), " черновик");
    return panel;
  }

  it("правка агента, пришедшая во время черновика, не затирается молча: сохранение сперва предупреждает", async () => {
    const app = await renderApp(FILES, "/p/spa/t/SPA-1");
    const panel = await startDraft(app);
    const agentBody = "Описание\n\nДописано агентом\n";
    await updateTask(app.root, { id: "SPA-1", changes: { body: agentBody }, now: new Date(), via: "cli" });
    await app.user.selectOptions(within(panel).getByRole("combobox", { name: "Статус" }), "in-progress");
    expect(await within(panel).findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Задача изменилась на диске"));

    await app.user.click(within(panel).getByRole("button", { name: "Сохранить" }));

    await waitFor(() => expect(within(panel).getByRole("alert").textContent).toContain("Описание изменилось на диске"));
    expect((await taskOnDisk(app.root, "SPA-1")).body).toBe(agentBody);

    await app.user.click(within(panel).getByRole("button", { name: "Сохранить" }));

    await waitFor(async () => expect((await taskOnDisk(app.root, "SPA-1")).body).toContain("черновик"));
  });

  it("своя правка поля во время черновика не выдаётся за конфликт описания", async () => {
    const patches = holdFirstPatch();
    const app = await renderApp(FILES, "/p/spa/t/SPA-1", undefined, { beforeRender: patches.beforeRender });
    const panel = await startDraft(app);

    await app.user.selectOptions(within(panel).getByRole("combobox", { name: "Приоритет" }), "critical");

    const save = within(panel).getByRole("button", { name: "Сохранить" });
    expect(save.getAttribute("aria-busy")).not.toBe("true");
    patches.release();
    await waitFor(() => expect(within(panel).getByRole("status").textContent).toBe("Сохранено"));
    await app.user.click(save);

    await waitFor(async () => expect((await taskOnDisk(app.root, "SPA-1")).body).toContain("черновик"));
    expect((await taskOnDisk(app.root, "SPA-1")).priority).toBe("critical");
    expect(within(panel).queryByRole("alert")).toBeNull();
  });

  it("пока описание сохраняется, смена другого поля не открывает повторное «Сохранить»", async () => {
    const patches = holdFirstPatch();
    const app = await renderApp(FILES, "/p/spa/t/SPA-1", undefined, { beforeRender: patches.beforeRender });
    const panel = await startDraft(app);

    await app.user.click(within(panel).getByRole("button", { name: "Сохранить" }));
    await app.user.selectOptions(within(panel).getByRole("combobox", { name: "Приоритет" }), "critical");

    expect(within(panel).getByRole("button", { name: "Сохраняем…" }).getAttribute("aria-busy")).toBe("true");
    expect(within(panel).getByRole("button", { name: "Отмена" }).getAttribute("aria-disabled")).toBe("true");
    patches.release();

    await waitFor(async () => expect((await taskOnDisk(app.root, "SPA-1")).priority).toBe("critical"));
    expect((await taskOnDisk(app.root, "SPA-1")).body).toContain("черновик");
    expect(within(panel).queryByRole("alert")).toBeNull();
  });

  it("конфликт описания не теряется, если за его сохранением в очереди стоит правка поля", async () => {
    const patches = holdFirstPatch();
    const app = await renderApp(FILES, "/p/spa/t/SPA-1", undefined, { beforeRender: patches.beforeRender });
    const panel = await startDraft(app);

    await app.user.click(within(panel).getByRole("button", { name: "Сохранить" }));
    await updateTask(app.root, { id: "SPA-1", changes: { body: "Описание\n\nДописано агентом\n" }, now: new Date(), via: "cli" });
    await app.user.selectOptions(within(panel).getByRole("combobox", { name: "Приоритет" }), "critical");
    patches.release();

    await waitFor(() => expect(patches.sent).toHaveLength(2));
    await waitFor(() => expect(within(panel).getByRole("status").textContent).toBe(""));
    expect(within(panel).getAllByRole("alert").map((alert) => alert.textContent).join()).toContain("Описание изменилось на диске");
  });

  it("«Отмена» после конфликта описания снимает предупреждение: повторять нечего", async () => {
    const app = await renderApp(FILES, "/p/spa/t/SPA-1");
    const panel = await startDraft(app);
    await updateTask(app.root, { id: "SPA-1", changes: { body: "Описание\n\nДописано агентом\n" }, now: new Date(), via: "cli" });

    await app.user.click(within(panel).getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(within(panel).getByRole("alert").textContent).toContain("Описание изменилось на диске"));
    await app.user.click(within(panel).getByRole("button", { name: "Отмена" }));

    expect(within(panel).queryByRole("alert")).toBeNull();
  });

  it("сохранение описания не забирает фокус из поля, куда человек перешёл, пока оно шло", async () => {
    const patches = holdFirstPatch();
    const app = await renderApp(FILES, "/p/spa/t/SPA-1", undefined, { beforeRender: patches.beforeRender });
    const panel = await startDraft(app);
    const title = within(panel).getByRole("textbox", { name: "Название задачи" });

    await app.user.click(within(panel).getByRole("button", { name: "Сохранить" }));
    await app.user.click(title);
    await app.user.type(title, " и ещё");
    patches.release();

    await waitFor(async () => expect((await taskOnDisk(app.root, "SPA-1")).body).toContain("черновик"));
    await waitFor(() => expect(within(panel).getByRole("button", { name: "Редактировать описание" })).toBeDefined());
    expect(document.activeElement).toBe(title);
    expect(patches.sent).toHaveLength(1);
  });

  it("фокус уходит в поле описания и возвращается на «Редактировать описание» после «Отмена» и «Сохранить»", async () => {
    const app = await renderApp(FILES, "/p/spa/t/SPA-1");
    const panel = await startDraft(app);
    expect(document.activeElement).toBe(within(panel).getByRole("textbox", { name: "Описание задачи" }));

    await app.user.click(within(panel).getByRole("button", { name: "Отмена" }));
    expect(document.activeElement).toBe(within(panel).getByRole("button", { name: "Редактировать описание" }));

    await app.user.keyboard("{Enter}");
    await app.user.keyboard(" ещё");
    await app.user.click(within(panel).getByRole("button", { name: "Сохранить" }));

    await waitFor(() => expect(document.activeElement).toBe(within(panel).getByRole("button", { name: "Редактировать описание" })));
    expect((await taskOnDisk(app.root, "SPA-1")).body).toContain("ещё");
  });

  it("закрытие карточки спрашивает: отказ оставляет черновик, согласие закрывает", async () => {
    const confirm = stubConfirm(false);
    const app = await renderApp(FILES, "/p/spa/t/SPA-1");
    const panel = await startDraft(app);

    await app.user.click(within(panel).getByRole("button", { name: "Закрыть" }));

    expect(confirm).toHaveBeenCalledWith(LEAVE);
    expect(app.route()).toBe("/p/spa/t/SPA-1");
    expect(within(panel).getByRole<HTMLTextAreaElement>("textbox", { name: "Описание задачи" }).value).toContain("черновик");

    confirm.mockReturnValue(true);
    await app.user.click(within(panel).getByRole("button", { name: "Закрыть" }));

    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Задача SPA-1" })).toBeNull());
    expect(app.route()).toBe("/p/spa");
  });

  it("переход к другой задаче из списка спрашивает, согласие открывает её", async () => {
    const confirm = stubConfirm(false);
    const app = await renderApp(FILES, "/p/spa/t/SPA-1");
    await startDraft(app);
    const otherTask = () => within(screen.getByRole("table")).getByRole("link", { name: "Связана" });

    await app.user.click(otherTask());

    expect(confirm).toHaveBeenCalledWith(LEAVE);
    expect(app.route()).toBe("/p/spa/t/SPA-1");

    confirm.mockReturnValue(true);
    await app.user.click(otherTask());

    expect(await screen.findByRole("complementary", { name: "Задача SPA-4" })).toBeDefined();
  });

  it("ссылка на связанную задачу в карточке и проект в боковой панели спрашивают", async () => {
    const confirm = stubConfirm(false);
    const app = await renderApp(FILES, "/p/spa/t/SPA-1");
    const panel = await startDraft(app);

    await app.user.click(within(panel).getByRole("link", { name: "Блокер" }));
    await app.user.click(screen.getByRole("link", { name: "Проекты" }));

    expect(confirm).toHaveBeenCalledTimes(2);
    expect(app.route()).toBe("/p/spa/t/SPA-1");
  });

  it("«назад» в браузере спрашивает", async () => {
    const confirm = stubConfirm(false);
    const app = await renderApp(FILES, "/p/spa");
    await app.user.click(await screen.findByRole("link", { name: "Таймауты загрузки" }));
    await startDraft(app);

    await act(async () => {
      await app.router.navigate(-1);
    });

    expect(confirm).toHaveBeenCalledWith(LEAVE);
    expect(app.route()).toBe("/p/spa/t/SPA-1");
  });

  it("согласие на «назад» уходит со страницы задачи", async () => {
    const confirm = stubConfirm(true);
    const app = await renderApp(FILES, "/p/spa");
    await app.user.click(await screen.findByRole("link", { name: "Таймауты загрузки" }));
    await startDraft(app);

    await act(async () => {
      await app.router.navigate(-1);
    });

    expect(confirm).toHaveBeenCalledWith(LEAVE);
    expect(app.route()).toBe("/p/spa");
    expect(screen.queryByRole("complementary", { name: "Задача SPA-1" })).toBeNull();
  });

  it("перезагрузка с черновиком получает предупреждение браузера", async () => {
    const app = await renderApp(FILES, "/p/spa/t/SPA-1");
    const panel = await startDraft(app);

    const beforeCancel = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeCancel);
    expect(beforeCancel.defaultPrevented).toBe(true);

    await app.user.click(within(panel).getByRole("button", { name: "Отмена" }));

    const afterCancel = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(afterCancel);
    expect(afterCancel.defaultPrevented).toBe(false);
  });

  it("смена фильтра и переходы без черновика ничего не спрашивают", async () => {
    const confirm = stubConfirm(false);
    const app = await renderApp(FILES, "/p/spa/t/SPA-1");
    const panel = await startDraft(app);

    await app.user.click(within(screen.getByRole("group", { name: "Статус" })).getByRole("button", { name: "сделана" }));

    expect(app.route()).toContain("status=");
    expect(within(panel).getByRole("textbox", { name: "Описание задачи" })).toBeDefined();

    await app.user.click(within(panel).getByRole("button", { name: "Отмена" }));
    await app.user.click(within(screen.getByRole("table")).getByRole("link", { name: "Связана" }));

    expect(await screen.findByRole("complementary", { name: "Задача SPA-4" })).toBeDefined();
    expect(confirm).not.toHaveBeenCalled();
  });

});

describe("отклик на сохранение", () => {
  it("после сохранения карточка говорит «Сохранено»", async () => {
    const app = await renderApp(FILES, "/p/spa/t/SPA-1");
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-1" });

    const priority = within(panel).getByRole("combobox", { name: "Приоритет" });
    await app.user.selectOptions(priority, "critical");

    await waitFor(() => expect(within(panel).getByRole("status").textContent).toBe("Сохранено"));
  });
});

describe("английский язык", () => {
  it("поля и отклик на сохранение карточки переведены", async () => {
    const app = await renderApp(FILES, "/p/spa/t/SPA-1", undefined, { language: "en" });
    const panel = await screen.findByRole("complementary", { name: "Task SPA-1" });

    expect(within(panel).getByRole("combobox", { name: "Status" })).toBeDefined();

    const priority = within(panel).getByRole("combobox", { name: "Priority" });
    await app.user.selectOptions(priority, "critical");

    await waitFor(() => expect(within(panel).getByRole("status").textContent).toBe("Saved"));
  });
});
