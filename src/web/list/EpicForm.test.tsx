import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createEpic } from "../../core/store/epics";
import { loadBacklog } from "../../core/store/load";
import { projectFile } from "../../core/store/testing/temp-dirs";
import { taskFixture } from "../testing/fixtures";
import { renderApp } from "../testing/render-app";

vi.mock("../../core/store/epics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../core/store/epics")>();
  return { ...actual, createEpic: vi.fn(actual.createEpic) };
});

const FILES = {
  "spa/project.md": projectFile("SPA"),
  "spa/SPA-1.md": taskFixture("SPA-1", { title: "Таймауты загрузки" }),
  "spa/SPA-2.md": taskFixture("SPA-2", { title: "Ретраи загрузки" }),
  "torg-io/project.md": projectFile("TI"),
  "torg-io/TI-1.md": taskFixture("TI-1", { title: "Каталог тормозит" }),
};

describe("сборка эпика", () => {
  it("собирает выбранные задачи проекта в новый эпик", async () => {
    const app = await renderApp(FILES, "/p/spa");
    await screen.findAllByRole("row");

    await app.user.click(screen.getByRole("checkbox", { name: "Выбрать SPA-1" }));
    await app.user.click(screen.getByRole("checkbox", { name: "Выбрать SPA-2" }));
    expect(screen.getByText("Выбрано задач: 2")).toBeDefined();

    await app.user.click(screen.getByRole("button", { name: "Собрать в эпик" }));
    await app.user.type(screen.getByRole("textbox", { name: "Название эпика" }), "Загрузка файлов");
    await app.user.click(screen.getByRole("button", { name: "Создать эпик" }));

    await waitFor(async () => {
      const tasks = (await loadBacklog(app.root)).tasks;
      const epic = tasks.find((task) => task.title === "Загрузка файлов");
      expect(epic).toMatchObject({ id: "SPA-3", type: "epic" });
      expect(tasks.filter((task) => task.epic === "SPA-3").map((task) => task.id)).toEqual(["SPA-1", "SPA-2"]);
    });
    await waitFor(() => expect(screen.queryByText("Выбрано задач: 2")).toBeNull());
  });

  it("не даёт собрать эпик из задач разных проектов", async () => {
    const app = await renderApp(FILES);
    await screen.findAllByRole("row");

    await app.user.click(screen.getByRole("checkbox", { name: "Выбрать SPA-1" }));
    await app.user.click(screen.getByRole("checkbox", { name: "Выбрать TI-1" }));

    expect(screen.getByText(/Задачи из разных проектов/)).toBeDefined();
    expect(screen.queryByRole("button", { name: "Собрать в эпик" })).toBeNull();
  });

  it("после частично созданного эпика не предлагает собрать его ещё раз", async () => {
    const app = await renderApp(FILES, "/p/spa");
    await screen.findAllByRole("row");
    const tasks = (await loadBacklog(app.root)).tasks;
    const epic = tasks[0];
    if (!epic) throw new Error("нет задач");
    vi.mocked(createEpic).mockResolvedValueOnce({
      ok: false,
      reason: "partial",
      epic: { ...epic, id: "SPA-3", type: "epic" },
      attached: [],
      failedId: "SPA-2",
      errors: ["SPA-2: не найдена"],
    });

    await app.user.click(screen.getByRole("checkbox", { name: "Выбрать SPA-1" }));
    await app.user.click(screen.getByRole("checkbox", { name: "Выбрать SPA-2" }));
    await app.user.click(screen.getByRole("button", { name: "Собрать в эпик" }));
    await app.user.type(screen.getByRole("textbox", { name: "Название эпика" }), "Загрузка файлов");
    await app.user.click(screen.getByRole("button", { name: "Создать эпик" }));

    expect(await screen.findByText(/Эпик SPA-3 создан, но привязаны не все задачи/)).toBeDefined();
    expect(screen.queryByRole("button", { name: "Создать эпик" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Собрать в эпик" })).toBeNull();

    await app.user.click(screen.getByRole("button", { name: "Понятно" }));
    expect(screen.queryByText(/Эпик SPA-3 создан/)).toBeNull();
  });
});
