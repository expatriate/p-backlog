import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { projectFile, taskFile } from "../../core/store/testing/temp-dirs";
import { accessDenied, interceptApi, renderApp } from "../testing/render-app";
import { LIST_FILES, rowTitles } from "../testing/task-list";

describe("область «Проекты»", () => {
  it("пустой список называет открытые задачи в неучтённых проектах", async () => {
    await renderApp({
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-2.md": taskFile("SPA-2", { status: "done" }),
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

  it("сбой загрузки проектов виден в списке и в боковой панели с «Повторить», а не как пустой беклог", async () => {
    let projectsFail = true;
    const app = await renderApp(LIST_FILES, "/", undefined, {
      beforeRender: interceptApi(async (path, _init, passOn) => (path === "/api/projects" && projectsFail ? accessDenied() : passOn())),
    });

    const main = await screen.findByRole("main");
    const sidebar = screen.getByRole("navigation", { name: "Навигация" });
    expect(await within(main).findByText("Сервер вернул ошибку: EACCES: permission denied")).toBeDefined();
    expect(within(sidebar).getByText("Сервер вернул ошибку: EACCES: permission denied")).toBeDefined();
    expect(screen.queryByText(/Задач пока нет/)).toBeNull();

    projectsFail = false;
    await app.user.click(within(sidebar).getByRole("button", { name: "Повторить" }));

    await waitFor(async () => expect(await rowTitles()).toEqual(["Каталог тормозит", "Разобрать очередь", "Таймауты загрузки"]));
    expect(screen.queryByRole("button", { name: "Повторить" })).toBeNull();
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
