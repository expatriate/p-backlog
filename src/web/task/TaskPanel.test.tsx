import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { loadBacklog } from "../../core/store/load";
import { projectFile } from "../../core/store/testing/temp-dirs";
import { taskFixture } from "../testing/fixtures";
import { freezeDate } from "../testing/freeze-date";
import { renderApp } from "../testing/render-app";

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
    expect(within(panel).getByText("5 дн.").closest("[title]")?.getAttribute("title")).toBe("удалится 23.09");

    await app.user.click(within(panel).getByRole("button", { name: "Вернуть в беклог" }));

    await waitFor(async () => expect((await taskOnDisk(app.root, "SPA-1")).status).toBe("backlog"));
    const reopened = await taskOnDisk(app.root, "SPA-1");
    expect([reopened.closed, reopened.resolution, reopened.reason]).toEqual([undefined, undefined, undefined]);
  });

  it("в последние сутки вместо дней пишет «сегодня»", async () => {
    freezeDate("2026-09-23T06:00:00Z");
    await renderApp(CLOSED_FILES, "/p/spa/t/SPA-1");
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-1" });

    expect(within(panel).getByText("сегодня")).toBeDefined();
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
    expect(within(panel).getByRole("heading", { name: "Ссылаются как на связанную" })).toBeDefined();
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

  it("показывает ошибку правил и не ломает карточку", async () => {
    const app = await renderApp(FILES, "/p/spa/t/SPA-2");
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-2" });

    const epic = within(panel).getByRole("combobox", { name: "Эпик" });
    await app.user.type(epic, "SPA-1");
    await app.user.tab();

    expect(await within(panel).findByText(/SPA-1 не является эпиком/)).toBeDefined();
    expect((await taskOnDisk(app.root, "SPA-2")).epic).toBeUndefined();
  });
});
