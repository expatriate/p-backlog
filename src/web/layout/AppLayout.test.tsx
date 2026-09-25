import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { act, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeGraph } from "../../core/graph/testing/make-graph";
import { loadBacklog } from "../../core/store/load";
import { settingsFilePath } from "../../core/store/settings";
import { makeGitRepo, makeTempDir, projectFile, taskFile, writeFiles } from "../../core/store/testing/temp-dirs";
import type { TestApp } from "../../server/testing/test-app";
import { renderApp } from "../testing/render-app";

function failTasksRequest(app: TestApp): void {
  const request = app.request;
  app.request = async (path, init) => (path === "/api/tasks" ? Promise.reject(new TypeError("Failed to fetch")) : request(path, init));
}

function failProjectActivePatch(app: TestApp): void {
  const request = app.request;
  app.request = async (path, init) =>
    path.startsWith("/api/projects/") && init?.method === "PATCH" ? Promise.reject(new TypeError("Failed to fetch")) : request(path, init);
}

const FILES = {
  "spa/project.md": projectFile("SPA"),
  "spa/SPA-1.md": taskFile("SPA-1"),
  "torg-io/project.md": projectFile("TI", [], { active: false }),
  "torg-io/TI-1.md": taskFile("TI-1"),
};

describe("боковая панель", () => {
  it("неучтённый проект остаётся в списке, но не входит в счёт области", async () => {
    await renderApp(FILES);

    const ti = (await screen.findByRole("checkbox", { name: "Учитывать проект ti в области «Проекты»" })) as HTMLInputElement;
    const list = screen.getByRole("list", { name: "Проекты" });

    expect(within(list).getAllByRole("link").map((link) => link.textContent)).toEqual(["spa", "ti"]);
    expect(ti.checked).toBe(false);
    await waitFor(() => expect(screen.getByRole("link", { name: "Проекты" }).closest("div")?.textContent).toContain("1 задача"));
  });

  it("галочка включает проект в область", async () => {
    const { user, root } = await renderApp(FILES);

    await user.click(await screen.findByRole("checkbox", { name: "Учитывать проект ti в области «Проекты»" }));

    await waitFor(async () => expect((await loadBacklog(root)).projects.find((project) => project.id === "torg-io")?.active).toBe(true));
    await waitFor(() => expect(screen.getByRole("link", { name: "Проекты" }).closest("div")?.textContent).toContain("2 задачи"));
  });

  it("сбой сети при переключении галочки показывает «сервер не отвечает» по-русски, а не внутренний текст", async () => {
    const { user } = await renderApp(FILES, "/", undefined, { beforeRender: failProjectActivePatch });

    await user.click(await screen.findByRole("checkbox", { name: "Учитывать проект ti в области «Проекты»" }));

    expect(await screen.findByText(/Сервер беклога не отвечает/)).toBeDefined();
  });

  it("список проектов сворачивается, заметка об охвате видна всегда", async () => {
    const { user } = await renderApp(FILES);
    await screen.findByRole("checkbox", { name: "Учитывать проект ti в области «Проекты»" });
    expect(screen.getByText(/^учтено 1 из 2 проектов/)).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Свернуть список проектов" }));

    expect(screen.queryByRole("list", { name: "Проекты" })).toBeNull();
    expect(screen.getByText("учтено 1 из 2 проектов")).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Развернуть список проектов" }));

    expect(await screen.findByRole("list", { name: "Проекты" })).toBeDefined();
  });

  it("удаление проекта просит ввести его id, называет все задачи, включая закрытые, и оставляет фокус на «Проекты»", async () => {
    const { user, root } = await renderApp({ ...FILES, "spa/SPA-2.md": taskFile("SPA-2", "status: done\nclosed: 2026-09-20T10:00:00+03:00\n") });

    await user.click(await screen.findByRole("button", { name: "Удалить проект spa" }));
    expect(await screen.findByText(/^Задач: 2\./)).toBeDefined();

    const confirm = screen.getByRole("button", { name: "Удалить" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    await user.type(screen.getByRole("textbox"), "spa");
    await user.click(confirm);

    await waitFor(async () => expect((await loadBacklog(root)).projects.map((project) => project.id)).toEqual(["torg-io"]));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Удалить проект spa" })).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Проекты" }));
  });

  it.each([
    { from: "/stats/code", deleted: "spa", to: "/stats/code" },
    { from: "/p/torg-io", deleted: "spa", to: "/p/torg-io" },
    { from: "/p/spa/stats/code", deleted: "spa", to: "/stats/code" },
  ])("удаление $deleted со страницы $from оставляет на $to", async ({ from, deleted, to }) => {
    const app = await renderApp(FILES, from);

    await app.user.click(await screen.findByRole("button", { name: `Удалить проект ${deleted}` }));
    await app.user.type(screen.getByRole("textbox"), deleted);
    await app.user.click(screen.getByRole("button", { name: "Удалить" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: `Удалить проект ${deleted}` })).toBeNull());
    expect(app.route()).toBe(to);
  });

  it("пока задачи не загружены, диалог удаления не называет число задач, а счётчики — «—»", async () => {
    const { user } = await renderApp(FILES, "/", undefined, { beforeRender: failTasksRequest });

    await user.click(await screen.findByRole("button", { name: "Удалить проект spa" }));

    expect(screen.getByText("Каталог проекта удалится со всеми задачами, отменить нельзя.")).toBeDefined();
    expect(screen.queryByText(/Задач: 0/)).toBeNull();
    expect(screen.getByRole("link", { name: "Проекты" }).closest("div")?.textContent).toContain("—");
  });

  it("после закрытия диалога удаления фокус возвращается на кнопку удаления", async () => {
    const { user } = await renderApp(FILES);
    const remove = await screen.findByRole("button", { name: "Удалить проект spa" });

    await user.click(remove);
    await user.click(screen.getByRole("button", { name: "Отмена" }));

    expect(document.activeElement).toBe(remove);
  });
});

describe("переключатель языка", () => {
  it("переводит интерфейс и сохраняет выбор", async () => {
    const { user, root } = await renderApp(FILES);

    await user.click(await screen.findByRole("button", { name: "EN" }));

    expect(await screen.findByRole("link", { name: "Tasks" })).toBeDefined();
    expect(document.documentElement.lang).toBe("en");
    expect(JSON.parse(await readFile(settingsFilePath(root), "utf8"))).toEqual({ language: "en" });
  });
});

describe("ссылка «Статистика»", () => {
  it("текущая страница только на самой статистике, на вкладке — лишь раздел", async () => {
    const app = await renderApp(FILES, "/stats");
    const stats = await screen.findByRole("link", { name: "Статистика" });
    expect(stats.getAttribute("aria-current")).toBe("page");

    await act(() => app.router.navigate("/stats/quality"));

    await waitFor(() => expect(stats.getAttribute("aria-current")).toBe("true"));
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
