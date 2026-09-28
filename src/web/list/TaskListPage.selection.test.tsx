import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../testing/render-app";
import { LIST_FILES, rowTitles } from "../testing/task-list";

describe("выбор задач галочками", () => {
  const checkbox = (name: string) => screen.getByRole<HTMLInputElement>("checkbox", { name });

  it("галочка в строке выбирает задачу и не открывает карточку; в шапке — «все видимые» с промежуточным состоянием", async () => {
    const app = await renderApp(LIST_FILES);
    await screen.findAllByRole("row");
    const selectAll = checkbox("Выбрать все видимые");

    await app.user.click(checkbox("Выбрать SPA-3"));

    expect(checkbox("Выбрать SPA-3").checked).toBe(true);
    expect(app.route()).toBe("/");
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(selectAll.indeterminate).toBe(true);

    await app.user.click(selectAll);

    expect(["Выбрать TI-1", "Выбрать SPA-3", "Выбрать SPA-1"].map((name) => checkbox(name).checked)).toEqual([true, true, true]);
    expect(selectAll.checked).toBe(true);
    expect(selectAll.indeterminate).toBe(false);
  });

  it("Shift+клик выделяет диапазон от последней отмеченной", async () => {
    const app = await renderApp(LIST_FILES);
    await waitFor(async () => expect(await rowTitles()).toEqual(["Каталог тормозит", "Разобрать очередь", "Таймауты загрузки"]));

    await app.user.click(checkbox("Выбрать TI-1"));
    await app.user.keyboard("{Shift>}");
    await app.user.click(checkbox("Выбрать SPA-1"));
    await app.user.keyboard("{/Shift}");

    expect(checkbox("Выбрать SPA-3").checked).toBe(true);
    expect(checkbox("Выбрать SPA-1").checked).toBe(true);
  });

  it("пробел на строке в фокусе ставит галочку, не прокручивает страницу и не открывает карточку", async () => {
    const app = await renderApp(LIST_FILES);
    const title = await screen.findByRole("link", { name: "Разобрать очередь" });
    act(() => title.focus());

    const notPrevented = fireEvent.keyDown(title, { key: " " });

    expect(notPrevented).toBe(false);
    expect(checkbox("Выбрать SPA-3").checked).toBe(true);
    expect(app.route()).toBe("/");
  });

  it("выбор переживает поиск, а смена проекта в адресе его сбрасывает", async () => {
    const app = await renderApp(LIST_FILES);
    await screen.findAllByRole("row");
    await app.user.click(checkbox("Выбрать SPA-3"));
    const search = screen.getByRole("searchbox", { name: "Поиск задач" });

    await app.user.type(search, "таймаут");
    await waitFor(async () => expect(await rowTitles()).toEqual(["Таймауты загрузки"]));
    await app.user.clear(search);
    await waitFor(async () => expect(await rowTitles()).toContain("Разобрать очередь"));
    expect(checkbox("Выбрать SPA-3").checked).toBe(true);

    await app.user.click(screen.getByRole("link", { name: /spa/ }));

    await waitFor(() => expect(app.route()).toBe("/p/spa"));
    expect(checkbox("Выбрать SPA-3").checked).toBe(false);
  });

  it("по-английски галочки подписаны по-английски", async () => {
    await renderApp(LIST_FILES, "/", undefined, { language: "en" });

    expect(await screen.findByRole("checkbox", { name: "Select SPA-3" })).toBeDefined();
    expect(screen.getByRole("checkbox", { name: "Select all visible" })).toBeDefined();
  });
});
