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
  it("неучтённый проект остаётся в списке, но не входит в счёт области", async () => {
    await renderApp(FILES);

    const ti = (await screen.findByRole("checkbox", { name: "Учитывать ti в «Проекты»" })) as HTMLInputElement;
    const list = screen.getByRole("list", { name: "Проекты" });

    expect(within(list).getAllByRole("link").map((link) => link.textContent)).toEqual(["spa", "ti"]);
    expect(ti.checked).toBe(false);
    expect(screen.getByRole("link", { name: "Проекты" }).closest("div")?.textContent).toContain("1 задача");
  });

  it("галочка включает проект в область", async () => {
    const { user, root } = await renderApp(FILES);

    await user.click(await screen.findByRole("checkbox", { name: "Учитывать ti в «Проекты»" }));

    await waitFor(async () => expect((await loadBacklog(root)).projects.find((project) => project.id === "torg-io")?.active).toBe(true));
    await waitFor(() => expect(screen.getByRole("link", { name: "Проекты" }).closest("div")?.textContent).toContain("2 задачи"));
  });

  it("список проектов сворачивается", async () => {
    const { user } = await renderApp(FILES);

    await user.click(await screen.findByRole("button", { name: "Свернуть список проектов" }));

    expect(screen.queryByRole("list", { name: "Проекты" })).toBeNull();
    expect(screen.getByText("учтено 1 из 2 проектов")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Развернуть список проектов" }));

    expect(await screen.findByRole("list", { name: "Проекты" })).toBeDefined();
  });

  it("удаление проекта просит ввести его id", async () => {
    const { user, root } = await renderApp(FILES);

    await user.click(await screen.findByRole("button", { name: "Удалить проект spa" }));

    const confirm = screen.getByRole("button", { name: "Удалить" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    await user.type(screen.getByRole("textbox"), "spa");
    await user.click(confirm);

    await waitFor(async () => expect((await loadBacklog(root)).projects.map((project) => project.id)).toEqual(["torg-io"]));
  });
});
