import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { projectFile } from "../../core/store/testing/temp-dirs";
import { taskFixture } from "../testing/fixtures";
import { freezeDate } from "../testing/freeze-date";
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
  return rows.slice(1).map((row) => within(row).getAllByRole("link")[1]?.textContent ?? "");
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

  it("клик по заголовку колонки сортирует по ней, повторный — меняет направление", async () => {
    const app = await renderApp(FILES);
    await screen.findAllByRole("row");
    const titleHeader = screen.getByRole("columnheader", { name: /Задача/ });
    expect(screen.getByRole("columnheader", { name: /Создана/ }).getAttribute("aria-sort")).toBe("descending");

    await app.user.click(within(titleHeader).getByRole("button"));

    await waitFor(async () => expect(await rowTitles()).toEqual(["Каталог тормозит", "Разобрать очередь", "Таймауты загрузки"]));
    expect(titleHeader.getAttribute("aria-sort")).toBe("ascending");
    expect(app.route()).toContain("sort=title");

    await app.user.click(within(titleHeader).getByRole("button"));

    await waitFor(async () => expect(await rowTitles()).toEqual(["Таймауты загрузки", "Разобрать очередь", "Каталог тормозит"]));
    expect(titleHeader.getAttribute("aria-sort")).toBe("descending");
  });

  it("заголовок вида и заголовок вкладки называют, что открыто", async () => {
    const app = await renderApp(FILES);
    expect(await screen.findByRole("heading", { level: 1, name: "Все проекты" })).toBeDefined();
    expect(document.title).toBe("Все проекты — Беклог");

    await app.user.click(await screen.findByRole("link", { name: /spa/ }));

    expect(await screen.findByRole("heading", { level: 1, name: "spa" })).toBeDefined();
    expect(document.title).toBe("spa — Беклог");
  });

  it("если задачи скрыты фильтрами, пустой список предлагает их сбросить", async () => {
    const app = await renderApp(FILES);
    await screen.findAllByRole("row");

    await app.user.type(screen.getByRole("searchbox", { name: "Поиск задач" }), "нет такого");

    expect(await screen.findByText("Под фильтры ничего не подходит.")).toBeDefined();
    await app.user.click(screen.getByRole("button", { name: "Сбросить фильтры" }));
    await waitFor(async () => expect(await rowTitles()).toHaveLength(3));
  });

  it("проект только с закрытыми задачами предлагает показать все статусы, а не сбросить фильтры", async () => {
    const app = await renderApp({
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-2.md": taskFixture("SPA-2", { title: "Починить логин", status: "done" }),
    });

    expect(await screen.findByText("Открытых задач нет.")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Сбросить фильтры" })).toBeNull();
    await app.user.click(screen.getByRole("button", { name: "Показать все статусы" }));

    await waitFor(async () => expect(await rowTitles()).toEqual(["Починить логин"]));
    expect(app.route()).toBe("/?status=all");
  });

  it("пустой беклог объясняет, откуда берутся задачи", async () => {
    await renderApp({ "spa/project.md": projectFile("SPA") });

    expect(await screen.findByText(/Беклог наполняет агент/)).toBeDefined();
    expect(screen.queryByRole("button", { name: "Сбросить фильтры" })).toBeNull();
  });

  it("теги выбираются в раскрывающемся списке, выбранные видны и в свёрнутом виде", async () => {
    const app = await renderApp(FILES);
    await screen.findAllByRole("row");
    expect(screen.queryByRole("button", { name: "#upload" })).toBeNull();

    await app.user.click(screen.getByRole("button", { name: "Теги (1)" }));
    expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: "Найти тег" }));
    await app.user.click(within(screen.getByRole("group", { name: "Теги" })).getByRole("button", { name: "#upload" }));
    await waitFor(async () => expect(await rowTitles()).toEqual(["Таймауты загрузки"]));
    await app.user.click(screen.getByRole("button", { name: "Теги (1), выбрано 1" }));

    expect(screen.getByRole("button", { name: "#upload" }).getAttribute("aria-pressed")).toBe("true");
    expect(app.route()).toContain("tag=upload");
  });

  it("сортировки в тулбаре нет — только заголовки колонок", async () => {
    await renderApp(FILES);
    await screen.findAllByRole("row");

    expect(screen.queryByRole("combobox", { name: "Сортировать по" })).toBeNull();
    expect(screen.queryByRole("button", { name: "По возрастанию" })).toBeNull();
  });

  it("если к закрытым добавить открытые статусы, колонка даты снова «Создана» и сортирует по ней", async () => {
    const app = await renderApp(
      {
        ...FILES,
        "spa/SPA-5.md": taskFixture("SPA-5", { title: "Исправлено агентом", status: "done", closed: "2026-09-12T10:00:00+03:00", resolution: "fixed", reason: "есть" }),
      },
      "/p/spa?status=done%2Ccancelled&auto=1&sort=closed",
    );
    expect((await screen.findByRole("columnheader", { name: /Закрыта/ })).getAttribute("aria-sort")).toBe("descending");

    await app.user.click(within(screen.getByRole("group", { name: "Статус" })).getByRole("button", { name: "в беклоге" }));

    expect((await screen.findByRole("columnheader", { name: /Создана/ })).getAttribute("aria-sort")).toBe("descending");
  });

  it("после закрытия карточки фокус возвращается на задачу, с которой её открыли", async () => {
    const app = await renderApp(FILES);
    const link = await screen.findByRole("link", { name: "Таймауты загрузки" });

    await app.user.click(link);
    await screen.findByRole("complementary", { name: "Задача SPA-1" });
    await app.user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Задача SPA-1" })).toBeNull());
    expect(document.activeElement?.textContent).toBe("Таймауты загрузки");
  });

  it("по тегам не сортирует", async () => {
    await renderApp(FILES);
    await screen.findAllByRole("row");

    expect(within(screen.getByRole("columnheader", { name: "Теги" })).queryByRole("button")).toBeNull();
  });

  it("у закрытой задачи вместо прогресса — отсчёт до удаления, у автозакрытой — метка причины", async () => {
    freezeDate("2026-09-12T12:00:00Z");
    const closed = { status: "cancelled", closed: "2026-09-10T10:00:00+03:00", resolution: "obsolete", reason: "модуль удалён" };
    await renderApp({ ...FILES, "spa/SPA-5.md": taskFixture("SPA-5", { title: "Устаревшая", ...closed }) }, "/?status=cancelled");

    const row = (await screen.findByText("Устаревшая")).closest("tr");
    if (!row) throw new Error("нет строки");
    expect(within(row).getByText("кода нет").getAttribute("title")).toBe("модуль удалён");
    expect(within(row).queryByRole("progressbar")).toBeNull();
    expect(within(row).getByText("удалится через 5 дн.")).toBeDefined();
  });

  it("ссылка «Закрыты агентом» показывает автозакрытые задачи проекта, свежие сверху", async () => {
    const auto = (id: string, title: string, closed: string) =>
      taskFixture(id, { title, status: "done", closed, resolution: "fixed", reason: "есть" });
    const app = await renderApp({
      ...FILES,
      "spa/SPA-5.md": auto("SPA-5", "Старое исправление", "2026-09-12T10:00:00+03:00"),
      "spa/SPA-6.md": auto("SPA-6", "Свежее исправление", "2026-09-14T10:00:00+03:00"),
      "torg-io/TI-2.md": auto("TI-2", "Чужой проект", "2026-09-14T10:00:00+03:00"),
    }, "/p/spa");
    await screen.findAllByRole("row");

    const link = screen.getByRole("link", { name: /Закрыты агентом/ });
    expect(link.textContent).toContain("2");
    await app.user.click(link);

    await waitFor(async () => expect(await rowTitles()).toEqual(["Свежее исправление", "Старое исправление"]));
    expect(app.route()).toBe("/p/spa?status=done%2Ccancelled&auto=1&sort=closed");
    const autoChip = within(screen.getByRole("group", { name: "Тип" })).getByRole("button", { name: "закрыты агентом" });
    expect(autoChip.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("columnheader", { name: /Закрыта/ }).getAttribute("aria-sort")).toBe("descending");
    const freshRow = screen.getByText("Свежее исправление").closest("tr");
    if (!freshRow) throw new Error("нет строки");
    expect(within(freshRow).getByText("14.09.26")).toBeDefined();
  });

  it("чип «закрыты агентом» из обычного вида включает закрытые статусы", async () => {
    const app = await renderApp({
      ...FILES,
      "spa/SPA-5.md": taskFixture("SPA-5", { title: "Исправлено агентом", status: "done", closed: "2026-09-12T10:00:00+03:00", resolution: "fixed", reason: "есть" }),
    });
    await screen.findAllByRole("row");
    const autoChip = within(screen.getByRole("group", { name: "Тип" })).getByRole("button", { name: "закрыты агентом" });

    await app.user.click(autoChip);

    await waitFor(async () => expect(await rowTitles()).toEqual(["Исправлено агентом"]));
    expect(app.route()).toContain("status=done%2Ccancelled");
    expect(app.route()).toContain("auto=1");

    await app.user.click(autoChip);

    expect(app.route()).not.toContain("auto=1");
  });

  it("сообщает о файлах, которые не удалось разобрать", async () => {
    await renderApp({ ...FILES, "spa/SPA-9.md": "сломано" });

    expect(await screen.findByText(/Не удалось разобрать файлы/)).toBeDefined();
  });

  it("эпик и его задачи отмечены тоном эпика, тоны раздаются по номеру", async () => {
    await renderApp({
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-2.md": taskFixture("SPA-2", { title: "Эпик два", type: "epic" }),
      "spa/SPA-10.md": taskFixture("SPA-10", { title: "Эпик десять", type: "epic" }),
      "spa/SPA-11.md": taskFixture("SPA-11", { title: "Задача десятого", epic: "SPA-10" }),
      "spa/SPA-12.md": taskFixture("SPA-12", { title: "Без эпика" }),
    });
    const rowOf = async (title: string) => {
      const row = (await screen.findByText(title)).closest("tr");
      if (!row) throw new Error(`нет строки ${title}`);
      return row;
    };

    expect((await rowOf("Эпик два")).getAttribute("data-epic-tone")).toBe("1");
    expect((await rowOf("Эпик десять")).getAttribute("data-epic-tone")).toBe("2");
    expect((await rowOf("Задача десятого")).getAttribute("data-epic-tone")).toBe("2");
    expect((await rowOf("Без эпика")).hasAttribute("data-epic-tone")).toBe(false);
  });
});
