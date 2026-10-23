import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NBSP } from "../../core/i18n/plural";
import { projectFile, taskFile } from "../../core/store/testing/temp-dirs";
import { renderApp } from "../testing/render-app";

const BOARD_FILES = {
  "spa/project.md": projectFile("SPA"),
  "spa/SPA-1.md": taskFile("SPA-1", { title: "Таймауты загрузки", priority: "high" }),
  "spa/SPA-2.md": taskFile("SPA-2", { title: "Починить логин", status: "done" }),
  "spa/SPA-3.md": taskFile("SPA-3", { title: "Разобрать очередь", status: "in-progress" }),
  "spa/SPA-4.md": taskFile("SPA-4", { title: "Эпик загрузок", type: "epic" }),
  "spa/SPA-5.md": taskFile("SPA-5", { title: "Ждёт бэкенд", status: "blocked", priority: "high" }),
};

function columnCards(name: RegExp): string[] {
  const board = screen.getByRole("region", { name: "Доска задач" });
  return within(within(board).getByRole("region", { name }))
    .queryAllByRole("link")
    .map((link) => link.textContent);
}

describe("доска задач", () => {
  it("колонки — статусы из фильтра и всегда «сделана»; эпики на доску не попадают; вид переживает смену фильтра", async () => {
    const app = await renderApp(BOARD_FILES, "/");
    await screen.findAllByRole("row");

    await app.user.click(within(screen.getByRole("group", { name: "Вид" })).getByRole("button", { name: "Доска" }));

    const board = await screen.findByRole("region", { name: "Доска задач" });
    expect(
      within(board)
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual([`в беклоге 1${NBSP}задача`, `в работе 1${NBSP}задача`, `заблокирована 1${NBSP}задача`, `сделана 0${NBSP}задач`]);
    expect(columnCards(/^в беклоге/)).toEqual(["Таймауты загрузки"]);
    expect(columnCards(/^в работе/)).toEqual(["Разобрать очередь"]);
    expect(within(within(board).getByRole("region", { name: /^сделана/ })).getByText(/Закрытые скрыты фильтром/)).toBeDefined();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText(/^Пробел — взять задачу/, { selector: "p" })).toBeDefined();

    await app.user.click(within(screen.getByRole("group", { name: "Приоритет" })).getByRole("button", { name: "высокий" }));

    expect(app.route()).toContain("view=board");
    expect(columnCards(/^в беклоге/)).toEqual(["Таймауты загрузки"]);
    expect(columnCards(/^в работе/)).toEqual([]);
  });

  it("закрытые в фильтре — их карточки в колонке «сделана»; карточка открывает задачу, не уходя с доски", async () => {
    const app = await renderApp(BOARD_FILES, "/?status=all&view=board");

    const done = await screen.findByRole("region", { name: /^сделана/ });
    await app.user.click(within(done).getByRole("link", { name: "Починить логин" }));

    expect(app.route()).toBe("/t/SPA-2?status=all&view=board");
    expect(await screen.findByRole("complementary", { name: "Задача SPA-2" })).toBeDefined();
    expect(screen.getByRole("region", { name: "Доска задач" })).toBeDefined();
  });
});
