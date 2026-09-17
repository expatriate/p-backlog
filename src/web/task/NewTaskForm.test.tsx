import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { loadBacklog } from "../../core/store/load";
import { projectFile } from "../../core/store/testing/temp-dirs";
import { taskFixture } from "../testing/fixtures";
import { renderApp } from "../testing/render-app";

const FILES = {
  "spa/project.md": projectFile("SPA"),
  "spa/SPA-1.md": taskFixture("SPA-1", { title: "Таймауты загрузки" }),
  "torg-io/project.md": projectFile("TI"),
};

describe("форма новой задачи", () => {
  it("создаёт задачу в текущем проекте", async () => {
    const app = await renderApp(FILES, "/p/spa/new");
    const form = await screen.findByRole("complementary", { name: "Новая задача" });

    await app.user.type(screen.getByRole("textbox", { name: "Название" }), "Ретраи загрузки");
    await app.user.type(screen.getByRole("textbox", { name: "Теги через запятую" }), "upload, Network");
    await app.user.click(screen.getByRole("button", { name: "Создать задачу" }));

    await waitFor(async () => {
      const created = (await loadBacklog(app.root)).tasks.find((task) => task.title === "Ретраи загрузки");
      expect(created).toMatchObject({ id: "SPA-2", projectId: "spa", tags: ["upload", "network"] });
    });
    expect(form).toBeDefined();
  });

  it("в режиме всех проектов проект выбирается из тех, что знает сервер", async () => {
    const app = await renderApp(FILES, "/new");
    await screen.findByRole("complementary", { name: "Новая задача" });

    const projects = await screen.findByRole("combobox", { name: "Проект" });
    await screen.findByRole("option", { name: "spa" });
    const options = [...projects.querySelectorAll("option")].map((option) => option.value);
    expect(options).toEqual(["", "spa", "torg-io"]);

    await app.user.selectOptions(projects, "torg-io");
    await app.user.type(screen.getByRole("textbox", { name: "Название" }), "Каталог тормозит");
    await app.user.click(screen.getByRole("button", { name: "Создать задачу" }));

    await waitFor(async () => {
      const created = (await loadBacklog(app.root)).tasks.find((task) => task.title === "Каталог тормозит");
      expect(created).toMatchObject({ id: "TI-1", projectId: "torg-io" });
    });
  });
});
