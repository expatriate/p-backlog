import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { writeFiles } from "../../core/store/testing/temp-dirs";
import { accessDenied, interceptApi, renderApp, serverUnreachable } from "../testing/render-app";
import { LIST_FILES } from "../testing/task-list";

type TasksAnswer = "ok" | "unreachable" | "server-error" | "hang";

function controlTasksRequest(initial: TasksAnswer) {
  const control: { answer: TasksAnswer; gate?: Promise<void> } = { answer: initial };
  const beforeRender = interceptApi(async (path, _init, passOn) => {
    if (path === "/api/tasks") await control.gate;
    if (path !== "/api/tasks" || control.answer === "ok") return passOn();
    if (control.answer === "hang") return new Promise<Response>(() => {});
    if (control.answer === "unreachable") return serverUnreachable();
    return accessDenied();
  });
  return { control, beforeRender };
}

describe("список задач: загрузка, сбои и объявления", () => {
  it("недоступный сервер и ошибка сервера описаны по-разному", async () => {
    const { control, beforeRender } = controlTasksRequest("unreachable");
    await renderApp(LIST_FILES, "/", undefined, { beforeRender });

    expect(await screen.findByText(/^Сервер беклога не отвечает\. Запустите его:/)).toBeDefined();

    control.answer = "server-error";
    await userEvent.click(screen.getByRole("button", { name: "Повторить" }));

    expect(await screen.findByText("Сервер вернул ошибку: EACCES: permission denied")).toBeDefined();
    expect(screen.queryByText(/не отвечает/)).toBeNull();
  });

  it("«Повторить» после сбоя загруженного списка показывает, что повтор идёт, и не перезапускает его", async () => {
    const { control, beforeRender } = controlTasksRequest("ok");
    const app = await renderApp(LIST_FILES, "/", undefined, { beforeRender });
    await screen.findAllByRole("row");

    control.answer = "unreachable";
    await app.user.click(screen.getByRole("checkbox", { name: "Учитывать проект ti в области «Проекты»" }));
    const retry = await screen.findByRole("button", { name: "Повторить" });

    control.answer = "hang";
    await app.user.click(retry);

    expect(retry.textContent).toBe("Повторяем…");
    expect(retry.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(retry);
  });

  it("ошибка обновления не прячет уже загруженные строки: ошибка и «Повторить» над таблицей", async () => {
    const { control, beforeRender } = controlTasksRequest("ok");
    const app = await renderApp(LIST_FILES, "/", undefined, { beforeRender });
    await screen.findAllByRole("row");

    control.answer = "unreachable";
    await app.user.click(screen.getByRole("checkbox", { name: "Учитывать проект ti в области «Проекты»" }));

    expect(await screen.findByRole("button", { name: "Повторить" })).toBeDefined();
    expect(screen.getByRole("row", { name: /SPA-1/ })).toBeDefined();
  });

  it("«Повторить» после сбоя первой загрузки не роняет фокус: он на области состояния, после загрузки — на заголовке списка", async () => {
    const { control, beforeRender } = controlTasksRequest("unreachable");
    const app = await renderApp(LIST_FILES, "/", undefined, { beforeRender });
    const retry = await screen.findByRole("button", { name: "Повторить" });

    let release = () => {};
    control.gate = new Promise((resolve) => (release = resolve));
    retry.focus();
    await app.user.keyboard("{Enter}");

    await waitFor(() => expect(document.activeElement?.textContent).toBe("Загружаем задачи…"));
    expect(document.activeElement?.getAttribute("role")).toBe("status");

    control.answer = "ok";
    release();

    await screen.findAllByRole("row");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 })));
  });

  it("число задач объявляется через постоянную область статуса", async () => {
    const app = await renderApp(LIST_FILES);
    await screen.findAllByRole("row");
    const status = (await screen.findByText(/^В списке/)).closest("[role=status]");
    await waitFor(() => expect(status?.textContent).toBe("В списке 3\u00a0задачи"));

    await app.user.type(screen.getByRole("searchbox", { name: "Поиск задач" }), "очередь");

    await waitFor(() => expect(status?.textContent).toBe("В списке 1\u00a0задача"));
  });

  it("сообщает о файлах, которые не удалось разобрать", async () => {
    await renderApp({ ...LIST_FILES, "spa/SPA-9.md": "сломано" });

    expect(await screen.findByText(/Не удалось разобрать файлы/)).toBeDefined();
  });

  it("файл, сломанный после загрузки, объявляется через область статуса, существовавшую до ошибки", async () => {
    const app = await renderApp(LIST_FILES);
    await screen.findAllByRole("row");
    const statusesBefore = screen.getAllByRole("status");

    await writeFiles(app.root, { "spa/SPA-9.md": "сломано" });
    await app.user.click(screen.getByRole("checkbox", { name: "Учитывать проект ti в области «Проекты»" }));

    const announced = (await screen.findByText(/Не удалось разобрать файлы/)).closest("[role=status]");
    expect(statusesBefore).toContain(announced);
  });
});
