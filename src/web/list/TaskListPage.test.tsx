import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { projectFile, taskFile, writeFiles } from "../../core/store/testing/temp-dirs";
import { taskFixture } from "../testing/fixtures";
import { freezeDate } from "../testing/freeze-date";
import type { TestApp } from "../../server/testing/test-app";
import { renderApp } from "../testing/render-app";

const FILES = {
  "spa/project.md": projectFile("SPA"),
  "spa/SPA-1.md": taskFixture("SPA-1", { title: "Таймауты загрузки", priority: "high", tags: "[upload]", created: "2026-09-10T10:00:00+03:00" }),
  "spa/SPA-2.md": taskFixture("SPA-2", { title: "Починить логин", priority: "low", status: "done", created: "2026-09-12T10:00:00+03:00" }),
  "spa/SPA-3.md": taskFixture("SPA-3", { title: "Разобрать очередь", priority: "critical", created: "2026-09-14T10:00:00+03:00" }),
  "torg-io/project.md": projectFile("TI"),
  "torg-io/TI-1.md": taskFixture("TI-1", { title: "Каталог тормозит" }),
};

type TasksAnswer = "ok" | "unreachable" | "server-error" | "hang";

function controlTasksRequest(initial: TasksAnswer) {
  const control: { answer: TasksAnswer; gate?: Promise<void> } = { answer: initial };
  const beforeRender = (app: TestApp) => {
    const request = app.request;
    app.request = async (path, init) => {
      if (path === "/api/tasks") await control.gate;
      if (path !== "/api/tasks" || control.answer === "ok") return request(path, init);
      if (control.answer === "hang") return new Promise<Response>(() => {});
      if (control.answer === "unreachable") throw new TypeError("Failed to fetch");
      return new Response(JSON.stringify({ errors: ["EACCES: permission denied"] }), { status: 500, headers: { "content-type": "application/json" } });
    };
  };
  return { control, beforeRender };
}

async function rowTitles(): Promise<string[]> {
  const rows = await screen.findAllByRole("row");
  return rows.slice(1).map((row) => within(row).getAllByRole("link")[1]?.textContent ?? "");
}

describe("список задач", () => {
  it("показывает открытые задачи всех проектов и счётчики в боковой панели", async () => {
    await renderApp(FILES);

    await waitFor(async () => expect(await rowTitles()).toEqual(["Каталог тормозит", "Разобрать очередь", "Таймауты загрузки"]));
    const spa = await screen.findByRole("link", { name: /spa/ });
    expect(spa.closest("li")?.textContent).toContain("2");
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

  it("ввод в середину запроса оставляет каретку на месте", async () => {
    const app = await renderApp(FILES, `/?q=${encodeURIComponent("таймаут")}`);
    await screen.findAllByRole("row");
    const search = screen.getByRole<HTMLInputElement>("searchbox", { name: "Поиск задач" });

    await app.user.type(search, "ы", { initialSelectionStart: 3, initialSelectionEnd: 3 });
    await app.user.type(search, "ы", { skipClick: true });

    expect(search.value).toBe("тайыымаут");
    await waitFor(() => expect(app.route()).toBe(`/?q=${encodeURIComponent("тайыымаут")}`));
  });

  it("переход назад по истории, пока поле поиска в фокусе, показывает в поле запрос из адреса", async () => {
    const app = await renderApp(FILES, `/?q=${encodeURIComponent("таймаут")}`);
    await screen.findAllByRole("row");
    await act(() => app.router.navigate(`/t/SPA-1?q=${encodeURIComponent("таймаут")}`));
    const search = screen.getByRole<HTMLInputElement>("searchbox", { name: "Поиск задач" });
    await app.user.clear(search);
    await app.user.type(search, "очередь");
    await waitFor(() => expect(app.route()).toBe(`/t/SPA-1?q=${encodeURIComponent("очередь")}`));

    await act(() => app.router.navigate(-1));

    await waitFor(async () => expect(await rowTitles()).toEqual(["Таймауты загрузки"]));
    expect(document.activeElement).toBe(search);
    expect(search.value).toBe("таймаут");
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
    expect(await screen.findByRole("heading", { level: 1, name: "Проекты" })).toBeDefined();
    expect(document.title).toBe("Проекты — Беклог");

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
    expect(screen.getByRole<HTMLInputElement>("searchbox", { name: "Поиск задач" }).value).toBe("");
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

  it("теги выбираются в меню, выбранные видны и в свёрнутом виде", async () => {
    const app = await renderApp(FILES);
    await screen.findAllByRole("row");

    await app.user.click(screen.getByRole("button", { name: "Теги (1)" }));
    expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: "Найти тег" }));
    const menu = screen.getByRole("group", { name: "Теги" });
    await app.user.click(within(menu).getByRole("button", { name: "#upload" }));
    await waitFor(async () => expect(await rowTitles()).toEqual(["Таймауты загрузки"]));
    await app.user.click(screen.getByRole("button", { name: "Теги (1), выбрано 1" }));

    expect(within(menu).getByRole("button", { name: "#upload" }).getAttribute("aria-pressed")).toBe("true");
    expect(app.route()).toContain("tag=upload");
  });

  it("клик по тегу в строке включает фильтр, повторный — снимает", async () => {
    const app = await renderApp(FILES);
    const row = (await screen.findByText("Таймауты загрузки")).closest("tr");
    if (!row) throw new Error("нет строки");
    const tag = within(row).getByRole("button", { name: "#upload" });
    expect(tag.getAttribute("aria-pressed")).toBe("false");

    await app.user.click(tag);

    await waitFor(async () => expect(await rowTitles()).toEqual(["Таймауты загрузки"]));
    expect(app.route()).toContain("tag=upload");
    const pressed = within(screen.getAllByRole("row")[1] as HTMLElement).getByRole("button", { name: "#upload" });
    expect(pressed.getAttribute("aria-pressed")).toBe("true");

    await app.user.click(pressed);

    await waitFor(() => expect(app.route()).not.toContain("tag=upload"));
  });

  it("выбор тега не закрывает меню тегов", async () => {
    const app = await renderApp(FILES);
    await screen.findAllByRole("row");

    await app.user.click(screen.getByRole("button", { name: "Теги (1)" }));
    await app.user.click(within(screen.getByRole("group", { name: "Теги" })).getByRole("button", { name: "#upload" }));

    expect(screen.getByRole("group", { name: "Теги" })).toBeDefined();
  });

  it("Esc в меню тегов закрывает меню и возвращает фокус на кнопку, карточка остаётся", async () => {
    const app = await renderApp(FILES, "/t/SPA-1");
    await screen.findByRole("complementary", { name: "Задача SPA-1" });
    await app.user.click(screen.getByRole("button", { name: "Теги (1)" }));

    await app.user.keyboard("{Escape}");

    expect(screen.queryByRole("group", { name: "Теги" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Теги (1)" }));
    expect(screen.getByRole("complementary", { name: "Задача SPA-1" })).toBeDefined();
  });

  it("Esc при открытом меню закрывает меню, даже если фокус ушёл из него", async () => {
    const app = await renderApp(FILES, "/t/SPA-1");
    await screen.findByRole("complementary", { name: "Задача SPA-1" });
    await app.user.click(screen.getByRole("button", { name: "Теги (1)" }));

    act(() => {
      screen.getByRole("searchbox", { name: "Поиск задач" }).focus();
    });
    await app.user.keyboard("{Escape}");

    expect(screen.queryByRole("group", { name: "Теги" })).toBeNull();
    expect(screen.getByRole("complementary", { name: "Задача SPA-1" })).toBeDefined();
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
    expect(link.getAttribute("aria-current")).toBe("true");
    await app.user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Задача SPA-1" })).toBeNull());
    expect(document.activeElement?.textContent).toBe("Таймауты загрузки");
  });

  it("недоступный сервер и ошибка сервера описаны по-разному", async () => {
    const { control, beforeRender } = controlTasksRequest("unreachable");
    await renderApp(FILES, "/", undefined, { beforeRender });

    expect(await screen.findByText(/^Сервер беклога не отвечает\. Запустите его:/)).toBeDefined();

    control.answer = "server-error";
    await userEvent.click(screen.getByRole("button", { name: "Повторить" }));

    expect(await screen.findByText("Сервер вернул ошибку: EACCES: permission denied")).toBeDefined();
    expect(screen.queryByText(/не отвечает/)).toBeNull();
  });

  it("«Повторить» после сбоя загруженного списка показывает, что повтор идёт, и не перезапускает его", async () => {
    const { control, beforeRender } = controlTasksRequest("ok");
    const app = await renderApp(FILES, "/", undefined, { beforeRender });
    await screen.findAllByRole("row");

    control.answer = "unreachable";
    await app.user.click(screen.getByRole("checkbox", { name: "Учитывать проект ti в области «Проекты»" }));
    const retry = await screen.findByRole("button", { name: "Повторить" });

    control.answer = "hang";
    await app.user.click(retry);

    expect(retry.textContent).toBe("Повторяем…");
    expect(retry.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(retry);
  });

  it("ошибка обновления не прячет уже загруженные строки: ошибка и «Повторить» над таблицей", async () => {
    const { control, beforeRender } = controlTasksRequest("ok");
    const app = await renderApp(FILES, "/", undefined, { beforeRender });
    await screen.findAllByRole("row");

    control.answer = "unreachable";
    await app.user.click(screen.getByRole("checkbox", { name: "Учитывать проект ti в области «Проекты»" }));

    expect(await screen.findByRole("button", { name: "Повторить" })).toBeDefined();
    expect(screen.getByRole("row", { name: /SPA-1/ })).toBeDefined();
  });

  it("«Повторить» после сбоя первой загрузки не роняет фокус: он на области состояния, после загрузки — на заголовке списка", async () => {
    const { control, beforeRender } = controlTasksRequest("unreachable");
    const app = await renderApp(FILES, "/", undefined, { beforeRender });
    const retry = await screen.findByRole("button", { name: "Повторить" });

    let release = () => {};
    control.gate = new Promise((resolve) => (release = resolve));
    retry.focus();
    await app.user.keyboard("{Enter}");

    await waitFor(() => expect(document.activeElement?.textContent).toBe("Загружаем задачи…"));
    expect(document.activeElement?.getAttribute("role")).toBe("status");

    control.answer = "ok";
    release();

    await screen.findAllByRole("row");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 })));
  });

  it("«Сбросить фильтры» переводит фокус на заголовок списка, а не теряет его", async () => {
    const app = await renderApp(FILES);
    await screen.findAllByRole("row");
    await app.user.type(screen.getByRole("searchbox", { name: "Поиск задач" }), "нет такого");
    const reset = await screen.findByRole("button", { name: "Сбросить фильтры" });

    reset.focus();
    await app.user.keyboard("{Enter}");

    await waitFor(async () => expect(await rowTitles()).toHaveLength(3));
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 }));
  });

  it("число задач объявляется через постоянную область статуса", async () => {
    const app = await renderApp(FILES);
    await screen.findAllByRole("row");
    const status = (await screen.findByText(/^В списке/)).closest("[role=status]");
    await waitFor(() => expect(status?.textContent).toBe("В списке 3\u00a0задачи"));

    await app.user.type(screen.getByRole("searchbox", { name: "Поиск задач" }), "очередь");

    await waitFor(() => expect(status?.textContent).toBe("В списке 1\u00a0задача"));
  });

  it("задача из адреса, которой нет, отмечена, а список остаётся", async () => {
    await renderApp(FILES, "/t/SPA-99");

    expect(await screen.findByText("Задачи SPA-99 нет — возможно, её удалили после закрытия.")).toBeDefined();
    expect(await rowTitles()).toHaveLength(3);
  });

  it("неизвестный проект из адреса — «Проект не найден», а не пустой беклог", async () => {
    await renderApp(FILES, "/p/nope");

    expect(await screen.findByText("Проект не найден.")).toBeDefined();
    expect(screen.queryByText(/Беклог наполняет агент/)).toBeNull();
  });

  it("заголовок вкладки с открытой карточкой называет задачу", async () => {
    await renderApp(FILES, "/t/SPA-1");

    await screen.findByRole("complementary", { name: "Задача SPA-1" });
    expect(document.title).toBe("SPA-1 · Таймауты загрузки — Беклог");
  });

  it("карточка поверх страницы: под ней ничего не доступно с клавиатуры, после закрытия — снова доступно", async () => {
    const overlayLayout = document.head.appendChild(document.createElement("style"));
    overlayLayout.textContent = "aside { position: fixed; }";
    onTestFinished(() => overlayLayout.remove());
    const app = await renderApp(FILES);
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
    const overlayLayout = document.head.appendChild(document.createElement("style"));
    overlayLayout.textContent = "aside { position: fixed; }";
    onTestFinished(() => overlayLayout.remove());
    const app = await renderApp(FILES, "/t/SPA-1");
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-1" });

    await app.user.click(within(panel).getByRole("combobox", { name: "Приоритет" }));
    expect(app.route()).toBe("/t/SPA-1");

    await app.user.pointer({ keys: "[MouseLeft]", target: screen.getByRole("main") });

    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Задача SPA-1" })).toBeNull());
    expect(app.route()).toBe("/");
  });

  it("окно сузилось, и карточка легла поверх страницы — фокус из ставшего недоступным списка переходит в карточку", async () => {
    const app = await renderApp(FILES, "/t/SPA-1");
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-1" });
    await app.user.click(screen.getByRole("searchbox", { name: "Поиск задач" }));

    const overlayLayout = document.head.appendChild(document.createElement("style"));
    overlayLayout.textContent = "aside { position: fixed; }";
    onTestFinished(() => overlayLayout.remove());
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(screen.getByRole("searchbox", { name: "Поиск задач" }).closest("[inert]")).not.toBeNull();
    expect(document.activeElement).toBe(panel);
  });

  it("Esc в поле карточки, затем Esc — карточка закрыта, фокус на строке, с которой её открыли", async () => {
    const app = await renderApp(FILES);
    const link = await screen.findByRole("link", { name: "Таймауты загрузки" });

    await app.user.click(link);
    const panel = await screen.findByRole("complementary", { name: "Задача SPA-1" });
    await app.user.click(within(panel).getByRole("combobox", { name: "Приоритет" }));
    await app.user.keyboard("{Escape}");
    await app.user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Задача SPA-1" })).toBeNull());
    expect(document.activeElement).toBe(link);
  });

  it("по тегам не сортирует", async () => {
    await renderApp(FILES);
    await screen.findAllByRole("row");

    expect(within(screen.getByRole("columnheader", { name: "Теги" })).queryByRole("button")).toBeNull();
  });

  it("у закрытой задачи перед названием столбик удаления с подсказкой, прогресса в таблице нет", async () => {
    freezeDate("2026-09-12T12:00:00Z");
    const closed = { status: "cancelled", closed: "2026-09-10T10:00:00+03:00", resolution: "obsolete", reason: "модуль удалён" };
    await renderApp({ ...FILES, "spa/SPA-5.md": taskFixture("SPA-5", { title: "Устаревшая", ...closed }) }, "/?status=cancelled");

    const row = (await screen.findByText("Устаревшая")).closest("tr");
    if (!row) throw new Error("нет строки");
    expect(within(row).getByText("кода нет").getAttribute("title")).toBe("модуль удалён");
    expect(within(row).queryByRole("progressbar")).toBeNull();
    const bar = within(row).getByRole("img", { name: /удалится через 5 дн\./ });
    expect(bar.getAttribute("title")).toBe("удалится 17.09");
  });

  it("чип «закрыты агентом» со счётчиком показывает автозакрытые задачи проекта, свежие сверху", async () => {
    const auto = (id: string, title: string, closed: string) =>
      taskFixture(id, { title, status: "done", closed, resolution: "fixed", reason: "есть" });
    const app = await renderApp({
      ...FILES,
      "spa/SPA-5.md": auto("SPA-5", "Старое исправление", "2026-09-12T10:00:00+03:00"),
      "spa/SPA-6.md": auto("SPA-6", "Свежее исправление", "2026-09-14T10:00:00+03:00"),
      "torg-io/TI-2.md": auto("TI-2", "Чужой проект", "2026-09-14T10:00:00+03:00"),
    }, "/p/spa");
    await screen.findAllByRole("row");

    expect(screen.queryByRole("link", { name: /Закрыты агентом/ })).toBeNull();
    const autoChip = within(screen.getByRole("group", { name: "Тип" })).getByRole("button", { name: /закрыты агентом/ });
    expect(autoChip.textContent).toContain("2");
    await app.user.click(autoChip);

    await waitFor(async () => expect(await rowTitles()).toEqual(["Свежее исправление", "Старое исправление"]));
    expect(app.route()).toBe("/p/spa?status=done%2Ccancelled&auto=1&sort=closed");
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
    const autoChip = within(screen.getByRole("group", { name: "Тип" })).getByRole("button", { name: /закрыты агентом/ });

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

  it("файл, сломанный после загрузки, объявляется через область статуса, существовавшую до ошибки", async () => {
    const app = await renderApp(FILES);
    await screen.findAllByRole("row");
    const statusesBefore = screen.getAllByRole("status");

    await writeFiles(app.root, { "spa/SPA-9.md": "сломано" });
    await app.user.click(screen.getByRole("checkbox", { name: "Учитывать проект ti в области «Проекты»" }));

    const announced = (await screen.findByText(/Не удалось разобрать файлы/)).closest("[role=status]");
    expect(statusesBefore).toContain(announced);
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

  describe("фильтр по эпику", () => {
    const EPIC_FILES = {
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-1.md": taskFixture("SPA-1", { title: "Эпик загрузки", type: "epic" }),
      "spa/SPA-2.md": taskFixture("SPA-2", { title: "Таймауты", epic: "SPA-1" }),
      "spa/SPA-3.md": taskFixture("SPA-3", { title: "Ретраи", epic: "SPA-1" }),
      "spa/SPA-4.md": taskFixture("SPA-4", { title: "Сам по себе" }),
    };
    const EPIC_AND_TAG_FILES = { ...EPIC_FILES, "spa/SPA-5.md": taskFixture("SPA-5", { title: "С тегом", tags: "[upload]" }) };

    it("кнопки «Эпик» и «Теги» стоят отдельной строкой, не в ряду чипов", async () => {
      await renderApp(EPIC_AND_TAG_FILES);
      await screen.findAllByRole("row");

      const pickers = screen.getByRole("group", { name: "Эпик и теги" });
      expect(within(pickers).getByRole("button", { name: "Эпик: любой" })).toBeDefined();
      expect(within(pickers).getByRole("button", { name: "Теги (1)" })).toBeDefined();
      expect(pickers.contains(screen.getByRole("group", { name: "Статус" }))).toBe(false);
    });

    it("клик вне меню закрывает меню эпика и меню тегов", async () => {
      const app = await renderApp(EPIC_AND_TAG_FILES);
      await screen.findAllByRole("row");
      const heading = screen.getByRole("heading", { level: 1 });

      await app.user.click(screen.getByRole("button", { name: "Эпик: любой" }));
      await app.user.click(heading);
      expect(screen.queryByRole("group", { name: "Эпики" })).toBeNull();

      await app.user.click(screen.getByRole("button", { name: "Теги (1)" }));
      await app.user.click(heading);
      expect(screen.queryByRole("group", { name: "Теги" })).toBeNull();
    });

    it("кнопка раскрывает эпики с цветом и числом задач, выбор фильтрует, «×» сбрасывает", async () => {
      const app = await renderApp(EPIC_FILES);
      await screen.findAllByRole("row");

      await app.user.click(screen.getByRole("button", { name: "Эпик: любой" }));
      const options = screen.getByRole("group", { name: "Эпики" });
      expect(within(options).getByRole("button", { name: /Без эпика/ }).textContent).toContain("2");
      const epic = within(options).getByRole("button", { name: /SPA-1/ });
      expect(epic.textContent).toContain("Эпик загрузки");
      expect(epic.textContent).toContain("2");
      expect(epic.getAttribute("data-epic-tone")).toBe("1");

      await app.user.click(epic);

      await waitFor(async () => expect(await rowTitles()).toEqual(["Таймауты", "Ретраи"]));
      expect(app.route()).toBe("/?epic=SPA-1");
      expect(screen.queryByRole("group", { name: "Эпики" })).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Эпик: Эпик загрузки" }));

      await app.user.click(screen.getByRole("button", { name: "Сбросить эпик" }));

      await waitFor(async () => expect(await rowTitles()).toHaveLength(4));
      expect(app.route()).toBe("/");
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Эпик: любой" }));
    });

    it("«Без эпика» оставляет то, что не входит в эпики", async () => {
      const app = await renderApp(EPIC_FILES);
      await screen.findAllByRole("row");

      await app.user.click(screen.getByRole("button", { name: "Эпик: любой" }));
      await app.user.click(within(screen.getByRole("group", { name: "Эпики" })).getByRole("button", { name: /Без эпика/ }));

      await waitFor(async () => expect(await rowTitles()).toEqual(["Эпик загрузки", "Сам по себе"]));
      expect(app.route()).toBe("/?epic=none");
      expect(screen.getByRole("button", { name: "Эпик: без эпика" })).toBeDefined();
    });

    it("Esc закрывает меню эпиков, но не карточку задачи", async () => {
      const app = await renderApp(EPIC_FILES, "/t/SPA-2");
      await screen.findByRole("complementary", { name: "Задача SPA-2" });
      await app.user.click(screen.getByRole("button", { name: "Эпик: любой" }));

      await app.user.keyboard("{Escape}");

      expect(screen.queryByRole("group", { name: "Эпики" })).toBeNull();
      expect(screen.getByRole("complementary", { name: "Задача SPA-2" })).toBeDefined();
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Эпик: любой" }));
    });

    it("повторное нажатие на кнопку закрывает меню, выбранный пункт отмечен", async () => {
      const app = await renderApp(EPIC_FILES);
      await screen.findAllByRole("row");

      await app.user.click(screen.getByRole("button", { name: "Эпик: любой" }));
      expect(screen.getByRole("button", { name: "Любой эпик" }).getAttribute("aria-pressed")).toBe("true");

      await app.user.click(screen.getByRole("button", { name: /SPA-1/ }));
      await app.user.click(screen.getByRole("button", { name: "Эпик: Эпик загрузки" }));

      expect(screen.getByRole("button", { name: /SPA-1/ }).getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByRole("button", { name: "Любой эпик" }).getAttribute("aria-pressed")).toBe("false");

      await app.user.click(screen.getByRole("button", { name: "Эпик: Эпик загрузки" }));

      expect(screen.queryByRole("group", { name: "Эпики" })).toBeNull();
    });

    it("без эпиков кнопки нет", async () => {
      await renderApp(FILES);
      await screen.findAllByRole("row");

      expect(screen.queryByRole("button", { name: /^Эпик:/ })).toBeNull();
    });
  });
});

describe("шильдик «новая»", () => {
  const SEEN_KEY = "p-backlog.seen";
  const NEW_FILES = {
    "spa/project.md": projectFile("SPA"),
    "spa/SPA-1.md": taskFixture("SPA-1", { title: "Старая", created: "2026-09-10T10:00:00+03:00" }),
    "spa/SPA-2.md": taskFixture("SPA-2", { title: "Свежая", created: "2026-09-16T10:00:00+03:00" }),
    "spa/SPA-3.md": taskFixture("SPA-3", {
      title: "Свежая закрытая",
      created: "2026-09-16T11:00:00+03:00",
      status: "done",
      closed: "2026-09-16T12:00:00+03:00",
    }),
  };

  function rememberFirstVisit(iso: string, seen: string[] = []) {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ since: Date.parse(iso), ids: seen }));
  }

  async function hasBadge(title: string): Promise<boolean> {
    const row = (await screen.findByRole("link", { name: title })).closest("tr");
    if (!row) throw new Error(`нет строки ${title}`);
    return within(row).queryByText("новая") !== null;
  }

  it("при первом запуске существующие задачи не новые", async () => {
    await renderApp(NEW_FILES);

    expect(await hasBadge("Свежая")).toBe(false);
    expect(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "null")).toMatchObject({ ids: [] });
  });

  it("задача, созданная после первого запуска, новая, пока её не открыли; у закрытых шильдика нет", async () => {
    rememberFirstVisit("2026-09-15T00:00:00+03:00");
    const app = await renderApp(NEW_FILES, "/?status=all");

    expect(await hasBadge("Старая")).toBe(false);
    expect(await hasBadge("Свежая")).toBe(true);
    expect(await hasBadge("Свежая закрытая")).toBe(false);

    await app.user.click(screen.getByRole("link", { name: "Свежая" }));
    await screen.findByRole("complementary", { name: "Задача SPA-2" });
    expect(await hasBadge("Свежая")).toBe(false);

    await app.user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Задача SPA-2" })).toBeNull());

    expect(await hasBadge("Свежая")).toBe(false);
    expect(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "null").ids).toEqual(["SPA-2"]);
  });

  it("из памяти просмотренных уходят исчезнувшие с диска задачи, остальные остаются просмотренными", async () => {
    rememberFirstVisit("2026-09-15T00:00:00+03:00", ["SPA-2", "SPA-3", "SPA-99"]);
    await renderApp(NEW_FILES);

    expect(await hasBadge("Свежая")).toBe(false);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "null").ids).toEqual(["SPA-2", "SPA-3"]));
  });

  it("задача, открытая в другой вкладке раньше, чем эта о ней узнала, остаётся просмотренной", async () => {
    rememberFirstVisit("2026-09-15T00:00:00+03:00");
    await renderApp(NEW_FILES);
    expect(await hasBadge("Свежая")).toBe(true);

    rememberFirstVisit("2026-09-15T00:00:00+03:00", ["SPA-4"]);
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: SEEN_KEY }));
    });

    expect(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "null").ids).toEqual(["SPA-4"]);
  });

  it("просмотр в другой вкладке снимает шильдик", async () => {
    rememberFirstVisit("2026-09-15T00:00:00+03:00");
    await renderApp(NEW_FILES);
    expect(await hasBadge("Свежая")).toBe(true);

    rememberFirstVisit("2026-09-15T00:00:00+03:00", ["SPA-2"]);
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: SEEN_KEY }));
    });

    expect(await hasBadge("Свежая")).toBe(false);
  });

  it("без доступа к localStorage шильдиков нет, список работает", async () => {
    const denied = () => {
      throw new Error("доступ запрещён");
    };
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(denied);
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(denied);
    onTestFinished(() => {
      getItem.mockRestore();
      setItem.mockRestore();
    });

    await renderApp(NEW_FILES);

    expect(await hasBadge("Свежая")).toBe(false);
    expect(await rowTitles()).toEqual(["Свежая", "Старая"]);
  });
});

describe("область «Проекты»", () => {
  it("пустой список называет открытые задачи в неучтённых проектах", async () => {
    await renderApp({
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-2.md": taskFixture("SPA-2", { status: "done" }),
      "torg-io/project.md": projectFile("TI", [], { active: false }),
      "torg-io/TI-1.md": taskFile("TI-1"),
      "torg-io/TI-2.md": taskFile("TI-2"),
    });

    expect(await screen.findByText("В учтённых проектах открытых задач нет. Ещё 2 открытые задачи — в проектах без галочки.")).toBeDefined();
  });

  it("если в учтённых проектах задач нет совсем, пустой список не говорит «задач пока нет»", async () => {
    await renderApp({
      "spa/project.md": projectFile("SPA"),
      "torg-io/project.md": projectFile("TI", [], { active: false }),
      "torg-io/TI-1.md": taskFile("TI-1"),
    });

    expect(await screen.findByText("В учтённых проектах задач нет. Ещё 1 открытая задача — в проектах без галочки.")).toBeDefined();
    expect(screen.queryByText(/Задач пока нет/)).toBeNull();
  });

  it("не показывает задачи неактивного проекта", async () => {
    await renderApp({
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-1.md": taskFile("SPA-1"),
      "torg-io/project.md": projectFile("TI", [], { active: false }),
      "torg-io/TI-1.md": taskFile("TI-1"),
    });

    expect(await screen.findAllByRole("link", { name: /SPA-1/ })).not.toHaveLength(0);
    expect(screen.queryAllByRole("link", { name: /TI-1/ })).toHaveLength(0);
  });
});

describe("английский язык", () => {
  it("заголовок вида и колонки таблицы переведены", async () => {
    await renderApp(FILES, "/", undefined, { language: "en" });

    expect(await screen.findByRole("heading", { level: 1, name: "Projects" })).toBeDefined();
    expect(await screen.findByRole("columnheader", { name: /Status/ })).toBeDefined();
  });
});
