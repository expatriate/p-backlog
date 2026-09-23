import { focusManager } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RouteObject } from "react-router";
import { describe, expect, it } from "vitest";
import { gitCommitAll, makeGitRepo, makeTempDir, projectFile, writeFiles } from "../../core/store/testing/temp-dirs";
import { routes } from "../app/App";
import { taskFixture } from "../testing/fixtures";
import { freezeDate } from "../testing/freeze-date";
import { renderApp } from "../testing/render-app";
import { StatsPage } from "./StatsPage";
import { NBSP } from "../../core/stats/format";

const MINUS = "\u2212";

const FILES = {
  "spa/project.md": projectFile("SPA"),
  "spa/SPA-1.md": taskFixture("SPA-1", { title: "Таймауты", priority: "high", tags: "[upload]", source: "src/upload/client.ts:88", created: "2026-09-10T10:00:00+03:00" }),
  "spa/SPA-2.md": taskFixture("SPA-2", { title: "Логин", created: "2026-09-16T10:00:00+03:00" }),
  "spa/SPA-3.md": taskFixture("SPA-3", { title: "Починили", status: "done", closed: "2026-09-17T10:00:00+03:00", created: "2026-09-15T10:00:00+03:00" }),
  "torg-io/project.md": projectFile("TI"),
  "torg-io/TI-1.md": taskFixture("TI-1", { title: "Каталог", created: "2026-09-17T10:00:00+03:00" }),
};

type StatsAnswer = (real: () => Promise<Response>) => Promise<Response>;

const passThrough: StatsAnswer = (real) => real();

const failStats: StatsAnswer = () => Promise.resolve(new Response(JSON.stringify({ errors: ["сбой"] }), { status: 500 }));

async function renderStatsWith(firstAnswer: StatsAnswer) {
  let answer = firstAnswer;
  const app = await renderApp(FILES, "/stats", routes, {
    beforeRender: (backlog) => {
      const request = backlog.request;
      backlog.request = (path, init) => (path === "/api/stats" ? answer(() => request(path, init)) : request(path, init));
    },
  });
  return { app, answerStatsWith: (next: StatsAnswer) => (answer = next) };
}

function holdFailure() {
  let release = () => {};
  const answer: StatsAnswer = (real) => new Promise<void>((resolve) => (release = resolve)).then(() => failStats(real));
  return { answer, release: () => release() };
}

function refetchStats() {
  freezeDate(new Date(Date.now() + 120_000).toISOString());
  focusManager.setFocused(false);
  focusManager.setFocused(undefined);
}

describe("страница статистики", () => {
  it("показывает заголовок, четыре числа, недели и подпись о журнале", async () => {
    await renderApp(FILES, "/stats");

    expect(await screen.findByRole("heading", { level: 1, name: "Статистика · Проекты" })).toBeDefined();
    await waitFor(() => expect(document.title).toBe("Статистика · Проекты — Беклог"));
    const week = await screen.findByRole("group", { name: "За неделю" });
    expect(within(week).getByText("+2")).toBeDefined();
    expect(within(week).getByText("создано 3, закрыто 1")).toBeDefined();
    expect(screen.getByRole("figure", { name: new RegExp(`12${NBSP}недель: создано 4, закрыто 1, открыто сейчас 3`) })).toBeDefined();
    expect(screen.getByText(/Журнал ещё пуст/)).toBeDefined();
  });

  it("«Задачи сегодня» считает заведённые и закрытые за день в выбранной области", async () => {
    const today = {
      ...FILES,
      "spa/SPA-4.md": taskFixture("SPA-4", { title: "Сегодняшняя", created: "2026-09-18T10:00:00+03:00" }),
      "spa/SPA-5.md": taskFixture("SPA-5", { title: "Закрыли сегодня", status: "done", closed: "2026-09-18T11:00:00+03:00", created: "2026-09-12T10:00:00+03:00" }),
      "torg-io/TI-2.md": taskFixture("TI-2", { title: "Чужая сегодняшняя", created: "2026-09-18T10:00:00+03:00" }),
    };

    await renderApp(today, "/p/spa/stats");
    const own = await screen.findByRole("group", { name: "Задачи сегодня" });

    expect(own.textContent).toContain("+1");
    expect(own.textContent).toContain(`${MINUS}1`);
  });

  it("«Задачи сегодня» в области «Проекты» считает все активные проекты", async () => {
    const today = {
      ...FILES,
      "spa/SPA-4.md": taskFixture("SPA-4", { title: "Сегодняшняя", created: "2026-09-18T10:00:00+03:00" }),
      "torg-io/TI-2.md": taskFixture("TI-2", { title: "Чужая сегодняшняя", created: "2026-09-18T10:00:00+03:00" }),
    };

    await renderApp(today, "/stats");
    const all = await screen.findByRole("group", { name: "Задачи сегодня" });

    expect(all.textContent).toContain("+2");
    expect(all.textContent).toContain(`${MINUS}0`);
  });

  it("сравнение с прошлой неделей: стрелка, величина и пояснение для экранного диктора", async () => {
    const created = (at: string, task: string) => JSON.stringify({ at, task, via: "cli", kind: "created", type: "task", priority: "medium", tags: [] });
    await renderApp(
      {
        ...FILES,
        "spa/SPA-6.md": taskFixture("SPA-6", { title: "Прошлая неделя", created: "2026-09-08T10:00:00+03:00" }),
        "spa/journal.jsonl": [
          created("2026-09-05T10:00:00+03:00", "SPA-1"),
          created("2026-09-08T10:00:00+03:00", "SPA-6"),
          created("2026-09-16T10:00:00+03:00", "SPA-2"),
          created("2026-09-15T10:00:00+03:00", "SPA-3"),
        ].join("\n"),
      },
      "/p/spa/stats",
    );

    const week = await screen.findByRole("group", { name: "За неделю" });
    expect(week.textContent).toContain(`↓${NBSP}1${NBSP}за${NBSP}неделю`);
    expect(within(week).getByText("на 1 меньше, чем неделю назад — лучше")).toBeDefined();
  });

  it("ссылка «Статистика» в боковой панели сохраняет проект, переключение проекта остаётся на статистике", async () => {
    const app = await renderApp(FILES, "/p/spa");
    await screen.findAllByRole("row");

    await app.user.click(screen.getByRole("link", { name: /^Статистика/ }));
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

    expect(await screen.findByText("Не удалось разобрать строк журнала: 1. Они не входят в статистику — проверьте формат строк в journal.jsonl проекта.")).toBeDefined();
  });

  it("битые строки журнала, появившиеся после загрузки, объявляются через область статуса, существовавшую до них", async () => {
    const app = await renderApp(FILES, "/stats");
    await screen.findByRole("group", { name: "За неделю" });
    const statusesBefore = screen.getAllByRole("status");

    await writeFiles(app.root, { "spa/journal.jsonl": "сломано\n" });
    app.emitChange();
    refetchStats();

    const announced = (await screen.findByText(/Не удалось разобрать строк журнала: 1/)).closest("[role=status]");
    expect(statusesBefore).toContain(announced);
  });

  it("в области «Проекты» под заголовком видно, сколько проектов учтено", async () => {
    await renderApp({ ...FILES, "torg-io/project.md": projectFile("TI", [], { active: false }) }, "/stats");

    expect(await within(await screen.findByRole("main")).findByText("учтено 1 из 2 проектов")).toBeDefined();
  });

  it("ошибка первой загрузки: «Повторить» передаёт фокус области состояния, после загрузки — заголовку страницы", async () => {
    const { app, answerStatsWith } = await renderStatsWith(failStats);
    expect(await screen.findByText("Сервер вернул ошибку: сбой")).toBeDefined();

    const held = holdFailure();
    answerStatsWith(held.answer);
    await app.user.click(screen.getByRole("button", { name: "Повторить" }));

    await waitFor(() => expect(document.activeElement?.textContent).toBe("Считаем статистику…"));
    expect(document.activeElement?.getAttribute("role")).toBe("status");

    held.release();
    expect(await screen.findByRole("button", { name: "Повторить" })).toBeDefined();

    answerStatsWith(passThrough);
    await app.user.click(screen.getByRole("button", { name: "Повторить" }));

    await screen.findByRole("group", { name: "За неделю" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 })));
  });

  it("ошибка обновления: «Повторить» держит фокус и подпись «Повторяем…», пока идёт повтор", async () => {
    const { app, answerStatsWith } = await renderStatsWith(passThrough);
    await screen.findByRole("group", { name: "За неделю" });

    answerStatsWith(failStats);
    refetchStats();
    const retry = await screen.findByRole("button", { name: "Повторить" });

    const held = holdFailure();
    answerStatsWith(held.answer);
    await app.user.click(retry);

    const busy = await screen.findByRole("button", { name: "Повторяем…" });
    expect(busy.getAttribute("aria-busy")).toBe("true");
    expect(document.activeElement).toBe(busy);

    held.release();
    expect(await screen.findByRole("button", { name: "Повторить" })).toBe(document.activeElement);
  });

  it("ошибка обновления не прячет уже загруженные цифры: над ними ошибка и «Повторить»", async () => {
    const { answerStatsWith } = await renderStatsWith(passThrough);
    await screen.findByRole("group", { name: "За неделю" });

    answerStatsWith(failStats);
    refetchStats();

    const retry = await screen.findByRole("button", { name: "Повторить" });
    const week = screen.getByRole("group", { name: "За неделю" });
    expect(within(week).getByText("+2")).toBeDefined();
    expect(screen.getByText("Сервер вернул ошибку: сбой")).toBeDefined();
    expect(retry.compareDocumentPosition(week) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
    expect(within(panel).getByRole("img", { name: "до 7 дней: 1 (средних 1); 7–30 дней: 1 (высоких 1); 30–90 дней: 0; больше 90 дней: 0" })).toBeDefined();
  });

  it("как закрываются: причины, шум и возвраты", async () => {
    await renderApp(FILES, "/p/spa/stats");
    const panel = await screen.findByRole("region", { name: "Как закрываются" });

    expect(within(panel).getByText("сделано")).toBeDefined();
    expect(within(panel).getByText("сделано").closest("li")?.textContent).toBe("сделано1");
    expect(within(panel).getByText("Дубли среди закрытых").closest("li")?.textContent).toBe("Дубли среди закрытых0%");
    expect(within(panel).getByText("Возвраты").closest("li")?.textContent).toBe("Возвраты0");
  });
});

describe("вкладки статистики", () => {
  it("«Обзор» активен по умолчанию, «Качество» меняет адрес и заголовок вкладки", async () => {
    const app = await renderApp(FILES, "/stats");
    const tabs = await screen.findByRole("navigation", { name: "Разделы статистики" });
    expect(within(tabs).getByRole("link", { name: "Обзор" }).getAttribute("aria-current")).toBe("page");

    await app.user.click(within(tabs).getByRole("link", { name: "Качество" }));

    await waitFor(() => expect(app.route()).toBe("/stats/quality"));
    expect(document.title).toBe("Качество · Статистика · Проекты — Беклог");
    expect(within(tabs).getByRole("link", { name: "Качество" }).getAttribute("aria-current")).toBe("page");
    expect(screen.queryByRole("link", { name: "Поток" })).toBeNull();
  });

  it("пока грузится код вкладки, страница помечена занятой", async () => {
    let release = () => {};
    const chunk = new Promise<void>((resolve) => (release = resolve));
    const slowTabRoutes: RouteObject[] = [
      {
        path: "stats",
        Component: StatsPage,
        children: [
          { index: true, element: <p>обзор</p> },
          { path: "code", lazy: async () => chunk.then(() => ({ element: <p>код</p> })) },
        ],
      },
    ];
    const app = await renderApp(FILES, "/stats", slowTabRoutes);
    await screen.findByText("обзор");

    await app.user.click(screen.getByRole("link", { name: "Код" }));

    expect(screen.getByRole("main").getAttribute("aria-busy")).toBe("true");
    release();
    expect(await screen.findByText("код")).toBeDefined();
    expect(screen.getByRole("main").getAttribute("aria-busy")).toBeNull();
  });

  it("старый адрес «Потока» открывает «Обзор»", async () => {
    await renderApp(FILES, "/stats/flow");

    expect(await screen.findByRole("group", { name: "За неделю" })).toBeDefined();
    expect(document.title).toBe("Статистика · Проекты — Беклог");
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

    const churnPanel = await screen.findByRole("region", { name: "Долг в часто меняемом коде" });
    expect(app.route()).toBe("/p/spa/stats/code");
    expect(document.title).toBe("Код · Статистика · spa — Беклог");
    expect(within(churnPanel).getByText("src/upload")).toBeDefined();
    expect(within(churnPanel).getByText("1 коммит")).toBeDefined();
    expect(within(churnPanel).getByText("1 задача, вес 4")).toBeDefined();
    const densityPanel = screen.getByRole("region", { name: "Плотность долга" });
    expect(within(densityPanel).getByText("1000 на 1000 строк")).toBeDefined();
    expect(screen.getByText("Нет доступа к репозиторию: /nope/repo. Проверьте путь в repos файла project.md и что это git-репозиторий.")).toBeDefined();
  });

  it("без репозиториев и исправлений — пустые состояния", async () => {
    await renderApp(FILES, "/stats/code");

    expect(await screen.findByText("Долг не лежит в коде, который меняли за 90 дней")).toBeDefined();
    expect(screen.getByText("Нет данных о коде: у проектов нет доступных репозиториев")).toBeDefined();
  });
});

describe("вкладка «Качество»", () => {
  const cells = (row: HTMLElement) => [within(row).getByRole("rowheader").textContent, ...within(row).getAllByRole("cell").map((cell) => cell.textContent)];

  it("точность, категории и происхождение", async () => {
    const event = (fields: Record<string, unknown>) => JSON.stringify({ via: "check", ...fields });
    const app = await renderApp(
      {
        ...FILES,
        "spa/journal.jsonl": [
          event({ at: "2026-09-16T10:00:00+03:00", task: "SPA-1", kind: "candidate", evidence: "source-changed", mode: "changed" }),
          event({ at: "2026-09-17T10:00:00+03:00", task: "SPA-1", kind: "verified", via: "cli" }),
        ].join("\n"),
      },
      "/stats",
    );

    await app.user.click(await screen.findByRole("link", { name: "Качество" }));

    const accuracyPanel = await screen.findByRole("region", { name: "Точность проверки" });
    await waitFor(() => expect(app.route()).toBe("/stats/quality"));
    expect(document.title).toBe("Качество · Статистика · Проекты — Беклог");
    expect(cells(within(accuracyPanel).getByRole("row", { name: /код изменился/ }))).toEqual(["код изменился", "1", "0", "1", "0", "0%"]);
    const categoriesPanel = screen.getByRole("region", { name: "Категории" });
    expect(cells(within(categoriesPanel).getByRole("row", { name: /не указана/ }))).toEqual(["не указана", "3", "8", "4", "1"]);
    const originPanel = screen.getByRole("region", { name: "Происхождение" });
    expect(cells(within(originPanel).getByRole("row", { name: /неизвестно/ }))).toEqual(["неизвестно", "4", "3", "0"]);
    expect(within(originPanel).getByText("Ветки появятся у задач, заведённых через backlog new в репозитории")).toBeDefined();
  });

  it("без кандидатов — пустое состояние точности", async () => {
    await renderApp(FILES, "/stats/quality");

    expect(await screen.findByText("Проверка ещё не находила кандидатов")).toBeDefined();
  });
});

describe("вкладка «Эффект»", () => {
  it("числа, график и таблица; без 5 исправлений — оценки нет", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    await writeFiles(repo, { "src/a.ts": "a\nb\n" });
    gitCommitAll(repo, "init", "2026-09-12T10:00:00+03:00");
    const app = await renderApp({ ...FILES, "spa/project.md": projectFile("SPA", [repo]) }, "/p/spa/stats");

    await app.user.click(await screen.findByRole("link", { name: "Эффект" }));

    const kept = await screen.findByRole("group", { name: "Посторонних правок вынесено" });
    expect(app.route()).toBe("/p/spa/stats/effect");
    expect(document.title).toBe("Эффект · Статистика · spa — Беклог");
    expect(within(kept).getByText("0 строк")).toBeDefined();
    expect(within(kept).getByText("исправлено 0; оценка ожидающих появится после 5 исправлений · код 0, тесты 0")).toBeDefined();
    expect(within(screen.getByRole("group", { name: "Строк в пулреквестах" })).getByText("2")).toBeDefined();
    expect(screen.getByRole("figure", { name: /С внедрения беклога: в пулреквестах 2/ })).toBeDefined();
    expect(screen.getByRole("region", { name: "По проектам" })).toBeDefined();

    const grain = screen.getByRole("group", { name: "Масштаб графика" });
    expect(within(grain).getByRole("button", { name: "неделя" }).getAttribute("aria-pressed")).toBe("true");

    await app.user.click(within(grain).getByRole("button", { name: "день" }));

    expect(within(grain).getByRole("button", { name: "день" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(grain).getByRole("button", { name: "неделя" }).getAttribute("aria-pressed")).toBe("false");

    const explainer = screen.getByRole("region", { name: "Как считается выигрыш" });
    expect(within(explainer).getByText("Сейчас: 0 задач — 0 строк")).toBeDefined();
    expect(within(explainer).getByText(/^Сейчас: \d+ задач[аи]?, оценка появится после 5 исправлений$/)).toBeDefined();
    expect(within(explainer).getByText("Сейчас: код 0, тесты 0")).toBeDefined();
  });
});

describe("вкладка «Стоимость»", () => {
  it("заголовок, число вызовов CLI, таблица «Команды» и сводка памяти сервера", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    const transcriptsDir = await makeTempDir();
    const at = "2026-09-18T09:00:00.000Z";
    await writeFiles(transcriptsDir, {
      "proj1/session.jsonl":
        [
          { type: "user", isMeta: true, timestamp: at, cwd: repo, message: { content: "Stop hook feedback:\nБеклог spa: тест" } },
          {
            type: "assistant",
            timestamp: at,
            cwd: repo,
            message: { model: "claude-opus-5", usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } },
          },
        ]
          .map((line) => JSON.stringify(line))
          .join("\n") + "\n",
    });
    const runs =
      [
        { at: "2026-09-18T09:30:00+03:00", command: "hook stop", cwd: repo, ms: 120, rssMb: 90, exitCode: 0 },
        { at: "2026-09-18T09:31:00+03:00", command: "list", cwd: repo, ms: 40, rssMb: 80, exitCode: 0 },
      ]
        .map((line) => JSON.stringify(line))
        .join("\n") + "\n";

    const app = await renderApp({ "spa/project.md": projectFile("SPA", [repo]), ".runs.jsonl": runs }, "/p/spa/stats", routes, {
      transcriptsDir,
      beforeRender: (backlog) => backlog.memory.sample(),
    });

    await app.user.click(await screen.findByRole("link", { name: "Стоимость" }));

    await waitFor(() => expect(app.route()).toBe("/p/spa/stats/cost"));
    expect(document.title).toBe("Стоимость · Статистика · spa — Беклог");

    const cliCalls = await screen.findByRole("group", { name: "Вызовов CLI" });
    expect(within(cliCalls).getByText("1")).toBeDefined();

    expect(screen.getByRole("figure", { name: new RegExp(`^За 30${NBSP}дней: из-за хука .*; запусков хука 1, других команд 1$`) })).toBeDefined();

    const commands = screen.getByRole("region", { name: "Команды" });
    expect(within(commands).getByRole("row", { name: /list/ })).toBeDefined();

    expect(await screen.findByRole("figure", { name: new RegExp(`Сейчас \\S+${NBSP}МБ, максимум за час \\S+${NBSP}МБ`) })).toBeDefined();
  });

  it("каталог расшифровок пуст — вкладка говорит, что расшифровки не найдены", async () => {
    await renderApp({ "spa/project.md": projectFile("SPA") }, "/stats/cost", routes, { transcriptsDir: await makeTempDir() });

    expect(await screen.findByText("Расшифровки Claude Code не найдены.")).toBeDefined();
  });
});

describe("английский язык", () => {
  it("заголовок, вкладки, плитки и тревоги статистики — на английском", async () => {
    await renderApp(FILES, "/stats", routes, { language: "en" });

    expect(await screen.findByRole("heading", { level: 1, name: "Statistics · Projects" })).toBeDefined();
    await waitFor(() => expect(document.title).toBe("Statistics · Projects — Backlog"));
    const tabs = screen.getByRole("navigation", { name: "Statistics sections" });
    expect(within(tabs).getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBe("page");
    const week = await screen.findByRole("group", { name: "This week" });
    expect(within(week).getByText("created 3, closed 1")).toBeDefined();
    const alerts = screen.getByRole("status", { name: "Alerts" });
    expect(within(alerts).getByText("Urgent tasks have been waiting more than 7 days: 1")).toBeDefined();
  });

  it("быстрый режим хранится в кэше расхода без языка, а в таблице моделей подписан на английском", async () => {
    const repo = await makeGitRepo(await makeTempDir(), "spa");
    const transcriptsDir = await makeTempDir();
    const at = "2026-09-18T09:00:00.000Z";
    await writeFiles(transcriptsDir, {
      "proj1/session.jsonl":
        [
          { type: "user", isMeta: true, timestamp: at, cwd: repo, message: { content: "Stop hook feedback:\nBacklog spa: test" } },
          { type: "assistant", timestamp: at, cwd: repo, message: { model: "claude-opus-5", usage: { input_tokens: 1000, output_tokens: 200, speed: "fast" } } },
        ]
          .map((line) => JSON.stringify(line))
          .join("\n") + "\n",
    });

    const app = await renderApp({ "spa/project.md": projectFile("SPA", [repo]) }, "/p/spa/stats/cost", routes, { transcriptsDir, language: "en" });

    const models = await screen.findByRole("region", { name: "By model" });
    expect(within(models).getByRole("rowheader", { name: "claude-opus-5 (fast mode)" })).toBeDefined();
    const cache = await readFile(join(app.root, ".usage-cache.json"), "utf8");
    expect(cache).toContain('"model":"claude-opus-5:fast"');
    expect(cache).not.toMatch(/[А-Яа-яЁё]/);
  });
});

describe("тревоги", () => {
  it("блок над вкладками и число у раздела «Статистика»", async () => {
    await renderApp(FILES, "/stats");

    const block = await screen.findByRole("status", { name: "Тревоги" });
    expect(within(block).getByText("Тревоги")).toBeDefined();
    expect(within(block).getByText("Срочные задачи ждут дольше 7 дней: 1")).toBeDefined();
    expect(screen.getByRole("link", { name: /^Статистика/ }).textContent).toContain("1");
    expect(screen.getByRole("link", { name: /тревог: 1/ })).toBeDefined();
  });
});
