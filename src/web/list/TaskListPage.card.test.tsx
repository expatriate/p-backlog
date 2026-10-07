import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderApp } from "../testing/render-app";
import { applyPanelStyles } from "../testing/side-panel";
import { LIST_FILES, rowTitles } from "../testing/task-list";

describe("карточка поверх списка", () => {
  it("после закрытия карточки фокус возвращается на задачу, с которой её открыли", async () => {
    const app = await renderApp(LIST_FILES);
    const link = await screen.findByRole("link", { name: "Таймауты загрузки" });

    await app.user.click(link);
    await screen.findByRole("complementary", { name: "Задача SPA-1" });
    expect(link.getAttribute("aria-current")).toBe("true");
    await app.user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Задача SPA-1" })).toBeNull());
    expect(document.activeElement?.textContent).toBe("Таймауты загрузки");
  });

  it("задача из адреса, которой нет, отмечена, а список остаётся", async () => {
    await renderApp(LIST_FILES, "/t/SPA-99");

    expect(await screen.findByText("Задачи SPA-99 нет — возможно, её удалили после закрытия.")).toBeDefined();
    expect(await rowTitles()).toHaveLength(3);
  });

  it("неизвестный проект из адреса — «Проект не найден», а не пустой беклог", async () => {
    await renderApp(LIST_FILES, "/p/nope");

    expect(await screen.findByText("Проект не найден.")).toBeDefined();
    expect(screen.queryByText(/Беклог наполняет агент/)).toBeNull();
  });

  it("заголовок вкладки с открытой карточкой называет задачу", async () => {
    await renderApp(LIST_FILES, "/t/SPA-1");

    await screen.findByRole("complementary", { name: "Задача SPA-1" });
    expect(document.title).toBe("SPA-1 · Таймауты загрузки — Беклог");
  });

  it("карточка поверх страницы: под ней ничего не доступно с клавиатуры, после закрытия — снова доступно", async () => {
    applyPanelStyles("narrow");
    const app = await renderApp(LIST_FILES);
    const link = await screen.findByRole("link", { name: "Таймауты загрузки" });
    const nav = screen.getByRole("navigation", { name: "Навигация" });

    await app.user.click(link);
    await screen.findByRole("complementary", { name: "Задача SPA-1" });

    expect(nav.closest("[inert]")).not.toBeNull();
    expect(link.closest("[inert]")).not.toBeNull();

    await app.user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Задача SPA-1" })).toBeNull());
    expect(nav.closest("[inert]")).toBeNull();
    expect(link.closest("[inert]")).toBeNull();
    expect(document.activeElement).toBe(link);
  });

  it("карточка поверх страницы закрывается нажатием на затемнённый фон", async () => {
    applyPanelStyles("narrow");
    const app = await renderApp(LIST_FILES, "/t/SPA-1");
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-1" });

    await app.user.click(within(panel).getByRole("combobox", { name: "Приоритет" }));
    expect(app.route()).toBe("/t/SPA-1");

    await app.user.pointer({ keys: "[MouseLeft]", target: screen.getByRole("main") });

    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Задача SPA-1" })).toBeNull());
    expect(app.route()).toBe("/");
  });

  it("окно сузилось, и карточка легла поверх страницы — фокус из ставшего недоступным списка переходит в карточку", async () => {
    const app = await renderApp(LIST_FILES, "/t/SPA-1");
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-1" });
    await app.user.click(screen.getByRole("searchbox", { name: "Поиск задач" }));

    applyPanelStyles("narrow");
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(screen.getByRole("searchbox", { name: "Поиск задач" }).closest("[inert]")).not.toBeNull();
    expect(document.activeElement).toBe(panel);
  });

  it("Esc в поле карточки, затем Esc — карточка закрыта, фокус на строке, с которой её открыли", async () => {
    const app = await renderApp(LIST_FILES);
    const link = await screen.findByRole("link", { name: "Таймауты загрузки" });

    await app.user.click(link);
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-1" });
    await app.user.click(within(panel).getByRole("combobox", { name: "Приоритет" }));
    await app.user.keyboard("{Escape}");
    await app.user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Задача SPA-1" })).toBeNull());
    expect(document.activeElement).toBe(link);
  });
});
