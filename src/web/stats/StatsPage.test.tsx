import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { projectFile } from "../../core/store/testing/temp-dirs";
import { taskFixture } from "../testing/fixtures";
import { renderApp } from "../testing/render-app";

const FILES = {
  "spa/project.md": projectFile("SPA"),
  "spa/SPA-1.md": taskFixture("SPA-1", { title: "Таймауты", priority: "high", tags: "[upload]", source: "src/upload/client.ts:88", created: "2026-09-10T10:00:00+03:00" }),
  "spa/SPA-2.md": taskFixture("SPA-2", { title: "Логин", created: "2026-09-16T10:00:00+03:00" }),
  "spa/SPA-3.md": taskFixture("SPA-3", { title: "Починили", status: "done", closed: "2026-09-17T10:00:00+03:00", created: "2026-09-15T10:00:00+03:00" }),
  "torg-io/project.md": projectFile("TI"),
  "torg-io/TI-1.md": taskFixture("TI-1", { title: "Каталог", created: "2026-09-17T10:00:00+03:00" }),
};

describe("страница статистики", () => {
  it("показывает заголовок, четыре числа, недели и подпись о журнале", async () => {
    await renderApp(FILES, "/stats");

    expect(await screen.findByRole("heading", { level: 1, name: "Статистика · Все проекты" })).toBeDefined();
    expect(document.title).toBe("Статистика · Все проекты — Беклог");
    const open = await screen.findByRole("group", { name: "Открыто" });
    expect(within(open).getByText("3")).toBeDefined();
    expect(within(open).getByText("вес 8")).toBeDefined();
    expect(screen.getByRole("img", { name: /12 недель: создано 4, закрыто 1, открыто сейчас 3/ })).toBeDefined();
    expect(screen.getByText(/Журнал ещё пуст/)).toBeDefined();
  });

  it("ссылка «Статистика» в боковой панели сохраняет проект, переключение проекта остаётся на статистике", async () => {
    const app = await renderApp(FILES, "/p/spa");
    await screen.findAllByRole("row");

    await app.user.click(screen.getByRole("link", { name: "Статистика" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Статистика · spa" })).toBeDefined();
    expect(app.route()).toBe("/p/spa/stats");

    await app.user.click(screen.getByRole("link", { name: /^ti/ }));
    expect(await screen.findByRole("heading", { level: 1, name: "Статистика · ti" })).toBeDefined();
    expect(app.route()).toBe("/p/torg-io/stats");

    await app.user.click(screen.getByRole("link", { name: "Задачи" }));
    expect(await screen.findByRole("heading", { level: 1, name: "ti" })).toBeDefined();
    expect(app.route()).toBe("/p/torg-io");
  });

  it("битые строки журнала — предупреждение", async () => {
    await renderApp({ ...FILES, "spa/journal.jsonl": "сломано\n" }, "/stats");

    expect(await screen.findByText("Не удалось разобрать строк журнала: 1")).toBeDefined();
  });

  it("без задач — «Задач пока нет»", async () => {
    await renderApp({ "spa/project.md": projectFile("SPA") }, "/stats");

    expect(await screen.findByText("Задач пока нет.")).toBeDefined();
  });

  it("неизвестный проект — «Проект не найден» без кнопки «Повторить»", async () => {
    await renderApp(FILES, "/p/nope/stats");

    expect(await screen.findByText("Проект не найден.")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Повторить" })).toBeNull();
  });

  it("где болит: папки из source и теги — ссылки на отфильтрованный список", async () => {
    await renderApp(FILES, "/p/spa/stats");
    const panel = await screen.findByRole("region", { name: "Где болит" });

    expect(within(panel).getByText("src/upload")).toBeDefined();
    expect(within(panel).getByRole("link", { name: /#upload/ }).getAttribute("href")).toBe("/p/spa?tag=upload");
  });

  it("возраст открытых: корзины и критичные с высокими старше недели", async () => {
    await renderApp(FILES, "/p/spa/stats");
    const panel = await screen.findByRole("region", { name: "Возраст открытых" });

    expect(within(panel).getByText("Критичные и высокие старше 7 дней: 1")).toBeDefined();
    expect(within(panel).getByRole("img", { name: "до 7 дней: 1; 7–30 дней: 1; 30–90 дней: 0; больше 90 дней: 0" })).toBeDefined();
  });

  it("как закрываются: причины, кто закрыл, шум и возвраты", async () => {
    await renderApp(FILES, "/p/spa/stats");
    const panel = await screen.findByRole("region", { name: "Как закрываются" });

    expect(within(panel).getByText("сделано")).toBeDefined();
    expect(within(panel).getByText("неизвестно: 1")).toBeDefined();
    expect(within(panel).getByText("Дубли среди закрытых: 0%")).toBeDefined();
    expect(within(panel).getByText("Возвраты: 0")).toBeDefined();
  });
});
