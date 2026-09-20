import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { loadBacklog } from "../../core/store/load";
import { projectFile, taskFile } from "../../core/store/testing/temp-dirs";
import { renderApp } from "../testing/render-app";

const FILES = {
  "spa/project.md": projectFile("SPA"),
  "spa/SPA-1.md": taskFile("SPA-1"),
  "torg-io/project.md": projectFile("TI", [], { active: false }),
  "torg-io/TI-1.md": taskFile("TI-1"),
};

describe("боковая панель", () => {
  it("неактивный проект стоит отдельной группой и не входит в счётчик «Все проекты»", async () => {
    await renderApp(FILES);

    const inactive = await screen.findByRole("list", { name: "Неактивные" });
    expect(within(inactive).getByRole("link", { name: "ti1" })).toBeTruthy();
    expect((await screen.findByRole("link", { name: /Все проекты/ })).textContent).toBe("Все проекты1");
  });

  it("меню проекта переключает активность", async () => {
    const { user } = await renderApp(FILES);

    await user.click(await screen.findByRole("button", { name: "Действия с проектом spa" }));
    await user.click(screen.getByRole("button", { name: "Сделать неактивным" }));

    const inactive = await screen.findByRole("list", { name: "Неактивные" });
    expect(await within(inactive).findByRole("link", { name: "spa1" })).toBeTruthy();
  });

  it("удаление проекта просит ввести его id", async () => {
    const { user, root } = await renderApp(FILES);

    await user.click(await screen.findByRole("button", { name: "Действия с проектом spa" }));
    await user.click(screen.getByRole("button", { name: "Удалить…" }));

    const confirm = screen.getByRole("button", { name: "Удалить" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    await user.type(screen.getByRole("textbox"), "spa");
    await user.click(confirm);

    await waitFor(async () => expect((await loadBacklog(root)).projects.map((project) => project.id)).toEqual(["torg-io"]));
  });
});
