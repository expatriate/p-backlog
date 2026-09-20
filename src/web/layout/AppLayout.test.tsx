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
    expect(within(inactive).getByRole("link", { name: "ti" })).toBeTruthy();
    expect((await screen.findByRole("link", { name: /Все проекты/ })).closest("li")?.textContent).toBe("Все проекты1");
  });

  it("меню проекта переключает активность", async () => {
    const { user } = await renderApp(FILES);

    await user.click(await screen.findByRole("button", { name: "Действия с проектом spa" }));
    await user.click(screen.getByRole("button", { name: "Сделать неактивным" }));

    const inactive = await screen.findByRole("list", { name: "Неактивные" });
    expect(await within(inactive).findByRole("link", { name: "spa" })).toBeTruthy();
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

  it("полоска показывает доли приоритетов и озвучивается", async () => {
    await renderApp({
      "spa/project.md": projectFile("SPA"),
      "spa/SPA-1.md": taskFile("SPA-1", "priority: critical\n"),
      "spa/SPA-2.md": taskFile("SPA-2", "priority: high\n"),
      "spa/SPA-3.md": taskFile("SPA-3"),
      "spa/SPA-4.md": taskFile("SPA-4"),
    });

    const bars = await screen.findAllByRole("img", { name: "открыто 4: критичных 1, высоких 1" });

    expect(bars).toHaveLength(2);
    expect([...(bars[0] as HTMLElement).children].map((part) => (part as HTMLElement).style.width)).toEqual(["25%", "25%", "50%"]);
  });
});
