import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { projectFile } from "../../core/store/testing/temp-dirs";
import { taskFixture } from "../testing/fixtures";
import { renderApp } from "../testing/render-app";

const FILES = {
  "spa/project.md": projectFile("SPA"),
  "spa/SPA-1.md": taskFixture("SPA-1", { title: "Таймауты загрузки", priority: "high", tags: "[upload]", created: "2026-09-10T10:00:00+03:00" }),
  "spa/SPA-2.md": taskFixture("SPA-2", { title: "Починить логин", priority: "low", status: "done", created: "2026-09-12T10:00:00+03:00" }),
  "spa/SPA-3.md": taskFixture("SPA-3", { title: "Разобрать очередь", priority: "critical", created: "2026-09-14T10:00:00+03:00" }),
  "torg-io/project.md": projectFile("TI"),
  "torg-io/TI-1.md": taskFixture("TI-1", { title: "Каталог тормозит" }),
};

async function rowTitles(): Promise<string[]> {
  const rows = await screen.findAllByRole("row");
  return rows.slice(1).map((row) => within(row).getAllByRole("cell")[2]?.textContent ?? "");
}

describe("список задач", () => {
  it("показывает открытые задачи всех проектов и счётчики в боковой панели", async () => {
    await renderApp(FILES);

    await waitFor(async () => expect(await rowTitles()).toEqual(["Каталог тормозит", "Разобрать очередь", "Таймауты загрузки"]));
    const spa = await screen.findByRole("link", { name: /spa/ });
    expect(spa.textContent).toContain("2");
  });

  it("фильтрует по проекту через боковую панель", async () => {
    const app = await renderApp(FILES);
    await screen.findAllByRole("row");

    await app.user.click(await screen.findByRole("link", { name: /ti/ }));

    await waitFor(async () => expect(await rowTitles()).toEqual(["Каталог тормозит"]));
    expect(app.route()).toBe("/p/torg-io");
  });

  it("поиск фильтрует задачи и попадает в URL", async () => {
    const app = await renderApp(FILES);
    await screen.findAllByRole("row");

    await app.user.type(screen.getByRole("searchbox", { name: "Поиск задач" }), "очередь");

    await waitFor(async () => expect(await rowTitles()).toEqual(["Разобрать очередь"]));
    expect(app.route()).toBe("/?q=%D0%BE%D1%87%D0%B5%D1%80%D0%B5%D0%B4%D1%8C");
  });

  it("чип статуса добавляет закрытые задачи, повторное нажатие убирает", async () => {
    const app = await renderApp(FILES);
    await screen.findAllByRole("row");
    const doneChip = within(screen.getByRole("group", { name: "Статус" })).getByRole("button", { name: "сделана" });

    await app.user.click(doneChip);

    await waitFor(async () => expect(await rowTitles()).toContain("Починить логин"));
    expect(app.route()).toContain("status=backlog%2Cin-progress%2Cblocked%2Cdone");
    expect(doneChip.getAttribute("aria-pressed")).toBe("true");

    await app.user.click(doneChip);
    await waitFor(async () => expect(await rowTitles()).not.toContain("Починить логин"));
  });

  it("сортировка меняет порядок и направление", async () => {
    const app = await renderApp(FILES);
    await screen.findAllByRole("row");

    await app.user.selectOptions(screen.getByRole("combobox", { name: "Сортировать по" }), "title");

    await waitFor(async () => expect(await rowTitles()).toEqual(["Таймауты загрузки", "Разобрать очередь", "Каталог тормозит"]));

    await app.user.click(screen.getByRole("button", { name: "По убыванию" }));

    await waitFor(async () => expect(await rowTitles()).toEqual(["Каталог тормозит", "Разобрать очередь", "Таймауты загрузки"]));
    expect(app.route()).toContain("sort=title");
  });

  it("сообщает о файлах, которые не удалось разобрать", async () => {
    await renderApp({ ...FILES, "spa/SPA-9.md": "сломано" });

    expect(await screen.findByText(/Не удалось разобрать файлы/)).toBeDefined();
  });
});
