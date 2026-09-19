import { screen, within } from "@testing-library/react";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { gitCommitAll, makeGitRepo, makeTempDir, projectFile, writeFiles } from "../../core/store/testing/temp-dirs";
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

describe("вкладки статистики", () => {
  it("«Обзор» активен по умолчанию, «Поток» меняет адрес и заголовок вкладки", async () => {
    const app = await renderApp(FILES, "/stats");
    const tabs = await screen.findByRole("navigation", { name: "Разделы статистики" });
    expect(within(tabs).getByRole("link", { name: "Обзор" }).getAttribute("aria-current")).toBe("page");

    await app.user.click(within(tabs).getByRole("link", { name: "Поток" }));

    expect(await screen.findByRole("region", { name: "Прогноз" })).toBeDefined();
    expect(app.route()).toBe("/stats/flow");
    expect(document.title).toBe("Поток · Статистика · Все проекты — Беклог");
    expect(within(tabs).getByRole("link", { name: "Поток" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Статистика" }).getAttribute("aria-current")).toBe("page");
  });

  it("адрес со слэшем в конце — «Поток» активен и заголовок вкладки", async () => {
    await renderApp(FILES, "/stats/flow/");
    const tabs = await screen.findByRole("navigation", { name: "Разделы статистики" });

    expect(within(tabs).getByRole("link", { name: "Поток" }).getAttribute("aria-current")).toBe("page");
    expect(document.title).toBe("Поток · Статистика · Все проекты — Беклог");
  });

  it("смена проекта на «Потоке» остаётся на «Потоке»", async () => {
    const app = await renderApp(FILES, "/p/spa/stats/flow");
    await screen.findByRole("region", { name: "Прогноз" });

    await app.user.click(screen.getByRole("link", { name: /^ti/ }));

    expect(await screen.findByRole("heading", { level: 1, name: "Статистика · ti" })).toBeDefined();
    expect(app.route()).toBe("/p/torg-io/stats/flow");
  });

  it("прогноз и задачи в работе", async () => {
    await renderApp(
      {
        ...FILES,
        "spa/SPA-2.md": taskFixture("SPA-2", { title: "Логин", status: "in-progress", created: "2026-09-16T10:00:00+03:00" }),
        "spa/journal.jsonl": `${JSON.stringify({ at: "2026-09-16T12:00:00+03:00", task: "SPA-2", via: "cli", kind: "status", from: "backlog", to: "in-progress" })}\n`,
      },
      "/stats/flow",
    );

    const forecast = await screen.findByRole("region", { name: "Прогноз" });
    expect(within(forecast).getByText("Долг растёт на 0,8 задач в неделю")).toBeDefined();
    expect(within(forecast).getByText("за 4 недели: закрыто 1, создано 4")).toBeDefined();
    const now = screen.getByRole("region", { name: "В работе сейчас" });
    expect(within(now).getByText("в работе: 1 · заблокировано: 0")).toBeDefined();
    expect(within(now).getByRole("link", { name: "SPA-2" })).toBeDefined();
    expect(within(now).getByText("в работе · 2 дн.")).toBeDefined();
  });

  it("неизвестный проект на «Потоке» — «Проект не найден.»", async () => {
    await renderApp(FILES, "/p/nope/stats/flow");

    expect(await screen.findByText("Проект не найден.")).toBeDefined();
  });

  it("время в работе, одновременность и эпики", async () => {
    const event = (at: string, task: string, from: string, to: string) => JSON.stringify({ at, task, via: "cli", kind: "status", from, to });
    await renderApp(
      {
        ...FILES,
        "spa/SPA-2.md": taskFixture("SPA-2", { title: "Логин", status: "in-progress", epic: "SPA-4", created: "2026-09-16T10:00:00+03:00" }),
        "spa/SPA-4.md": taskFixture("SPA-4", { title: "Вход", type: "epic", created: "2026-09-10T10:00:00+03:00" }),
        "spa/journal.jsonl": [
          event("2026-09-15T12:00:00+03:00", "SPA-3", "backlog", "in-progress"),
          event("2026-09-16T12:00:00+03:00", "SPA-2", "backlog", "in-progress"),
          event("2026-09-17T12:00:00+03:00", "SPA-3", "in-progress", "done"),
        ].join("\n"),
      },
      "/p/spa/stats/flow",
    );

    const cycle = await screen.findByRole("region", { name: "Время в работе" });
    expect(within(cycle).getByText("медиана 2 дн. · 90% — за 2 дн.")).toBeDefined();
    expect(within(cycle).getByText("в блокировке — 0% этого времени · закрытий с работой: 1")).toBeDefined();
    expect(screen.getByRole("img", { name: "12 недель: сейчас в работе 1, максимум 2" })).toBeDefined();
    const epics = screen.getByRole("region", { name: "Эпики" });
    expect(within(epics).getByRole("link", { name: "SPA-4" })).toBeDefined();
    expect(within(epics).getByText("0/1 · темпа нет")).toBeDefined();
  });

  it("эпик без задач — без некорректной шкалы прогресса", async () => {
    await renderApp(
      { ...FILES, "spa/SPA-4.md": taskFixture("SPA-4", { title: "Вход", type: "epic", created: "2026-09-10T10:00:00+03:00" }) },
      "/p/spa/stats/flow",
    );

    const epics = await screen.findByRole("region", { name: "Эпики" });
    expect(within(epics).getByText("0/0 · темпа нет")).toBeDefined();
    expect(within(epics).queryByRole("progressbar", { name: /SPA-4/ })).toBeNull();
  });

  it("без взятий в работу — подсказка вместо времени", async () => {
    await renderApp(FILES, "/stats/flow");

    const cycle = await screen.findByRole("region", { name: "Время в работе" });
    expect(within(cycle).getByText("Появится, когда задачи начнут брать в работу")).toBeDefined();
    expect(screen.getByText("Открытых эпиков нет")).toBeDefined();
  });
});

describe("вкладка «Код»", () => {
  it("меняется × долг, плотность, кто исправил и недоступный репозиторий", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/upload/client.ts": "a\nb\n" });
    gitCommitAll(repo, "fix: upload\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>", "2026-09-12T10:00:00+03:00");
    const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
    const app = await renderApp(
      {
        ...FILES,
        "spa/project.md": projectFile("SPA", [repo, "/nope/repo"]),
        "spa/SPA-4.md": taskFixture("SPA-4", { title: "Починили загрузку", status: "done", resolution: "fixed", reason: `"Исправлено в ${sha}"`, created: "2026-09-11T10:00:00+03:00", closed: "2026-09-13T10:00:00+03:00" }),
      },
      "/p/spa/stats",
    );

    await app.user.click(await screen.findByRole("link", { name: "Код" }));

    const churnPanel = await screen.findByRole("region", { name: "Меняется × долг" });
    expect(app.route()).toBe("/p/spa/stats/code");
    expect(document.title).toBe("Код · Статистика · spa — Беклог");
    expect(within(churnPanel).getByText("src/upload")).toBeDefined();
    expect(within(churnPanel).getByText("1 коммитов")).toBeDefined();
    expect(within(churnPanel).getByText("1 задач, вес 4")).toBeDefined();
    const densityPanel = screen.getByRole("region", { name: "Плотность долга" });
    expect(within(densityPanel).getByText("1000 на 1000 строк")).toBeDefined();
    const fixesPanel = screen.getByRole("region", { name: "Кто исправил" });
    expect(within(fixesPanel).getByText("агент: 1 · медиана 1 дн.")).toBeDefined();
    expect(screen.getByText("Нет доступа к репозиторию: /nope/repo")).toBeDefined();
  });

  it("без репозиториев и исправлений — пустые состояния", async () => {
    await renderApp(FILES, "/stats/code");

    expect(await screen.findByText("Долг не лежит в коде, который меняли за 90 дней")).toBeDefined();
    expect(screen.getByText("Нет данных о коде: у проектов нет доступных репозиториев")).toBeDefined();
    expect(screen.getByText("Исправлений за 12 недель нет")).toBeDefined();
  });
});
