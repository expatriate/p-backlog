import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { projectFile, taskFile } from "../../core/store/testing/temp-dirs";
import { freezeDate } from "../testing/freeze-date";
import { renderApp } from "../testing/render-app";
import { LIST_FILES, rowTitles } from "../testing/task-list";

describe("список задач", () => {
  it("показывает открытые задачи всех проектов и счётчики в боковой панели", async () => {
    await renderApp(LIST_FILES);

    await waitFor(async () => expect(await rowTitles()).toEqual(["Каталог тормозит", "Разобрать очередь", "Таймауты загрузки"]));
    const spa = await screen.findByRole("link", { name: /spa/ });
    expect(spa.closest("li")?.textContent).toContain("2");
  });

  it("фильтрует по проекту через боковую панель", async () => {
    const app = await renderApp(LIST_FILES);
    await screen.findAllByRole("row");

    await app.user.click(await screen.findByRole("link", { name: /ti/ }));

    await waitFor(async () => expect(await rowTitles()).toEqual(["Каталог тормозит"]));
    expect(app.route()).toBe("/p/torg-io");
  });

  it("поиск фильтрует задачи и попадает в URL", async () => {
    const app = await renderApp(LIST_FILES);
    await screen.findAllByRole("row");

    await app.user.type(screen.getByRole("searchbox", { name: "Поиск задач" }), "очередь");

    await waitFor(async () => expect(await rowTitles()).toEqual(["Разобрать очередь"]));
    expect(app.route()).toBe("/?q=%D0%BE%D1%87%D0%B5%D1%80%D0%B5%D0%B4%D1%8C");
  });

  it("ввод в середину запроса оставляет каретку на месте", async () => {
    const app = await renderApp(LIST_FILES, `/?q=${encodeURIComponent("таймаут")}`);
    await screen.findAllByRole("row");
    const search = screen.getByRole<HTMLInputElement>("searchbox", { name: "Поиск задач" });

    await app.user.type(search, "ы", { initialSelectionStart: 3, initialSelectionEnd: 3 });
    await app.user.type(search, "ы", { skipClick: true });

    expect(search.value).toBe("тайыымаут");
    await waitFor(() => expect(app.route()).toBe(`/?q=${encodeURIComponent("тайыымаут")}`));
  });

  it("переход назад по истории, пока поле поиска в фокусе, показывает в поле запрос из адреса", async () => {
    const app = await renderApp(LIST_FILES, `/?q=${encodeURIComponent("таймаут")}`);
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
    const app = await renderApp(LIST_FILES);
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
    const app = await renderApp(LIST_FILES);
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
    const app = await renderApp(LIST_FILES);
    expect(await screen.findByRole("heading", { level: 1, name: "Проекты" })).toBeDefined();
    expect(document.title).toBe("Проекты — Беклог");

    await app.user.click(await screen.findByRole("link", { name: /spa/ }));

    expect(await screen.findByRole("heading", { level: 1, name: "spa" })).toBeDefined();
    expect(document.title).toBe("spa — Беклог");
  });

  it("если задачи скрыты фильтрами, пустой список предлагает их сбросить", async () => {
    const app = await renderApp(LIST_FILES);
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
      "spa/SPA-2.md": taskFile("SPA-2", { title: "Починить логин", status: "done" }),
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
    const app = await renderApp(LIST_FILES);
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
    const app = await renderApp(LIST_FILES);
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
    const app = await renderApp(LIST_FILES);
    await screen.findAllByRole("row");

    await app.user.click(screen.getByRole("button", { name: "Теги (1)" }));
    await app.user.click(within(screen.getByRole("group", { name: "Теги" })).getByRole("button", { name: "#upload" }));

    expect(screen.getByRole("group", { name: "Теги" })).toBeDefined();
  });

  it("Esc в меню тегов закрывает меню и возвращает фокус на кнопку, карточка остаётся", async () => {
    const app = await renderApp(LIST_FILES, "/t/SPA-1");
    await screen.findByRole("complementary", { name: "Задача SPA-1" });
    await app.user.click(screen.getByRole("button", { name: "Теги (1)" }));

    await app.user.keyboard("{Escape}");

    expect(screen.queryByRole("group", { name: "Теги" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Теги (1)" }));
    expect(screen.getByRole("complementary", { name: "Задача SPA-1" })).toBeDefined();
  });

  it("Esc при открытом меню закрывает меню, даже если фокус ушёл из него", async () => {
    const app = await renderApp(LIST_FILES, "/t/SPA-1");
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
    await renderApp(LIST_FILES);
    await screen.findAllByRole("row");

    expect(screen.queryByRole("combobox", { name: "Сортировать по" })).toBeNull();
    expect(screen.queryByRole("button", { name: "По возрастанию" })).toBeNull();
  });

  it("если к закрытым добавить открытые статусы, колонка даты снова «Создана» и сортирует по ней", async () => {
    const app = await renderApp(
      {
        ...LIST_FILES,
        "spa/SPA-5.md": taskFile("SPA-5", { title: "Исправлено агентом", status: "done", closed: "2026-09-12T10:00:00+03:00", resolution: "fixed", reason: "есть" }),
      },
      "/p/spa?status=done%2Ccancelled&auto=1&sort=closed",
    );
    expect((await screen.findByRole("columnheader", { name: /Закрыта/ })).getAttribute("aria-sort")).toBe("descending");

    await app.user.click(within(screen.getByRole("group", { name: "Статус" })).getByRole("button", { name: "в беклоге" }));

    expect((await screen.findByRole("columnheader", { name: /Создана/ })).getAttribute("aria-sort")).toBe("descending");
  });

  it("«Сбросить фильтры» переводит фокус на заголовок списка, а не теряет его", async () => {
    const app = await renderApp(LIST_FILES);
    await screen.findAllByRole("row");
    await app.user.type(screen.getByRole("searchbox", { name: "Поиск задач" }), "нет такого");
    const reset = await screen.findByRole("button", { name: "Сбросить фильтры" });

    reset.focus();
    await app.user.keyboard("{Enter}");

    await waitFor(async () => expect(await rowTitles()).toHaveLength(3));
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 }));
  });

  it("по тегам не сортирует", async () => {
    await renderApp(LIST_FILES);
    await screen.findAllByRole("row");

    expect(within(screen.getByRole("columnheader", { name: "Теги" })).queryByRole("button")).toBeNull();
  });

  it("у закрытой задачи перед названием столбик удаления с подсказкой, прогресса в таблице нет", async () => {
    freezeDate("2026-09-12T12:00:00Z");
    const closed = { status: "cancelled", closed: "2026-09-10T10:00:00+03:00", resolution: "obsolete", reason: "модуль удалён" };
    await renderApp({ ...LIST_FILES, "spa/SPA-5.md": taskFile("SPA-5", { title: "Устаревшая", ...closed }) }, "/?status=cancelled");

    const row = (await screen.findByText("Устаревшая")).closest("tr");
    if (!row) throw new Error("нет строки");
    expect(within(row).getByText("кода нет").getAttribute("title")).toBe("модуль удалён");
    expect(within(row).queryByRole("progressbar")).toBeNull();
    const bar = within(row).getByRole("img", { name: /удалится через 5 дн\./ });
    expect(bar.getAttribute("title")).toBe("удалится 17.09");
  });

  it("чип «закрыты агентом» со счётчиком показывает автозакрытые задачи проекта, свежие сверху", async () => {
    const auto = (id: string, title: string, closed: string) =>
      taskFile(id, { title, status: "done", closed, resolution: "fixed", reason: "есть" });
    const app = await renderApp({
      ...LIST_FILES,
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
      ...LIST_FILES,
      "spa/SPA-5.md": taskFile("SPA-5", { title: "Исправлено агентом", status: "done", closed: "2026-09-12T10:00:00+03:00", resolution: "fixed", reason: "есть" }),
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

  it("эпик и его задачи отмечены тоном эпика, тоны раздаются по номеру", async () => {
    await renderApp({
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-2.md": taskFile("SPA-2", { title: "Эпик два", type: "epic" }),
      "spa/SPA-10.md": taskFile("SPA-10", { title: "Эпик десять", type: "epic" }),
      "spa/SPA-11.md": taskFile("SPA-11", { title: "Задача десятого", epic: "SPA-10" }),
      "spa/SPA-12.md": taskFile("SPA-12", { title: "Без эпика" }),
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
      "spa/SPA-1.md": taskFile("SPA-1", { title: "Эпик загрузки", type: "epic" }),
      "spa/SPA-2.md": taskFile("SPA-2", { title: "Таймауты", epic: "SPA-1" }),
      "spa/SPA-3.md": taskFile("SPA-3", { title: "Ретраи", epic: "SPA-1" }),
      "spa/SPA-4.md": taskFile("SPA-4", { title: "Сам по себе" }),
    };
    const EPIC_AND_TAG_FILES = { ...EPIC_FILES, "spa/SPA-5.md": taskFile("SPA-5", { title: "С тегом", tags: "[upload]" }) };

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
      await renderApp(LIST_FILES);
      await screen.findAllByRole("row");

      expect(screen.queryByRole("button", { name: /^Эпик:/ })).toBeNull();
    });
  });
});

describe("английский язык", () => {
  it("заголовок вида и колонки таблицы переведены", async () => {
    await renderApp(LIST_FILES, "/", undefined, { language: "en" });

    expect(await screen.findByRole("heading", { level: 1, name: "Projects" })).toBeDefined();
    expect(await screen.findByRole("columnheader", { name: /Status/ })).toBeDefined();
  });
});
