import { createHash } from "node:crypto";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeGraph } from "../../core/graph/testing/make-graph";
import { loadBacklog } from "../../core/store/load";
import { makeGitRepo, makeTempDir, projectFile, taskFile, writeFiles } from "../../core/store/testing/temp-dirs";
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
    await screen.findByRole("checkbox", { name: "Учитывать ti в «Проекты»" });

    await user.click(screen.getByRole("button", { name: "Свернуть список проектов" }));

    expect(screen.queryByRole("list", { name: "Проекты" })).toBeNull();
    expect(screen.getByText("учтено 1 из 2 проектов")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Развернуть список проектов" }));

    expect(await screen.findByRole("list", { name: "Проекты" })).toBeDefined();
  });

  it("удаление проекта просит ввести его id и называет все задачи, включая закрытые", async () => {
    const { user, root } = await renderApp({ ...FILES, "spa/SPA-2.md": taskFile("SPA-2", "status: done\nclosed: 2026-09-20T10:00:00+03:00\n") });

    await user.click(await screen.findByRole("button", { name: "Удалить проект spa" }));
    expect(screen.getByText(/^Задач: 2\./)).toBeDefined();

    const confirm = screen.getByRole("button", { name: "Удалить" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    await user.type(screen.getByRole("textbox"), "spa");
    await user.click(confirm);

    await waitFor(async () => expect((await loadBacklog(root)).projects.map((project) => project.id)).toEqual(["torg-io"]));
  });
});

describe("уведомление про граф кода", () => {
  async function filesWithRepos(graph: "none" | "fresh" | "stale") {
    const home = await makeTempDir();
    const repo = await makeGitRepo(home, "projects/spa");
    await writeFiles(repo, { "src/a.ts": "const a = 1;\n" });
    const builtFrom = graph === "stale" ? "const a = 0;\n" : "const a = 1;\n";
    if (graph !== "none") await makeGraph(repo, [{ path: "src/a.ts", hash: createHash("sha256").update(builtFrom).digest("hex"), symbols: [] }]);
    return { "spa/project.md": projectFile("SPA", [repo]), "spa/SPA-1.md": taskFile("SPA-1", "source: src/a.ts:1\n") };
  }

  it("строка появляется, когда у активного проекта нет графа", async () => {
    await renderApp(await filesWithRepos("none"));

    expect(await screen.findByText(/Без графа кода: 1 проект/)).toBeTruthy();
  });

  it("граф, от которого ушли файлы задач, назван устаревшим, а не собранным", async () => {
    await renderApp(await filesWithRepos("stale"));

    expect(await screen.findByText(/Граф кода устарел: 1 проект/)).toBeTruthy();
    expect(screen.queryByText(/Без графа кода/)).toBeNull();
  });

  it("строки нет, когда граф собран и свежий у всех проектов", async () => {
    await renderApp(await filesWithRepos("fresh"));

    await screen.findByRole("list", { name: "Проекты" });
    expect(screen.queryByText(/Без графа кода|Граф кода устарел/)).toBeNull();
  });
});
