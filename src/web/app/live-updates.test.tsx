import { join } from "node:path";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { projectFile, writeFiles } from "../../core/store/testing/temp-dirs";
import type { TestApp } from "../../server/testing/test-app";
import { taskFixture } from "../testing/fixtures";
import { renderApp } from "../testing/render-app";

const FILES = {
  "spa/project.md": projectFile("SPA"),
  "spa/SPA-1.md": taskFixture("SPA-1", { title: "Таймауты загрузки" }),
  "spa/SPA-3.md": taskFixture("SPA-3", { title: "Разобрать очередь", priority: "low" }),
};

function countTaskLoads() {
  const loads = { started: 0, inFlight: 0, eventsOpened: false };
  const beforeRender = (app: TestApp) => {
    const request = app.request;
    app.request = async (path, init) => {
      if (path === "/api/events") loads.eventsOpened = true;
      if (path !== "/api/tasks") return request(path, init);
      loads.started++;
      loads.inFlight++;
      try {
        return await request(path, init);
      } finally {
        loads.inFlight--;
      }
    };
  };
  const settled = () => waitFor(() => expect(loads).toMatchObject({ eventsOpened: true, inFlight: 0 }));
  return { loads, beforeRender, settled };
}

describe("живое обновление после своей правки", () => {
  it("событие о своей записи не перезапрашивает список, чужое изменение — перезапрашивает", async () => {
    const { loads, beforeRender, settled } = countTaskLoads();
    const app = await renderApp(FILES, "/", undefined, { beforeRender });
    await screen.findAllByRole("row");
    await settled();
    const before = loads.started;

    await app.user.click(screen.getByRole("checkbox", { name: "Выбрать SPA-3" }));
    const panel = screen.getByRole("region", { name: "Действия с выбранными" });
    await app.user.click(within(panel).getByRole("button", { name: "Приоритет" }));
    await app.user.click(within(panel).getByRole("button", { name: "критичный" }));
    await screen.findByText("Изменена 1 из 1");
    await settled();
    await app.emitChange([join(app.root, "spa/SPA-3.md"), join(app.root, "spa/journal.jsonl")]);

    await writeFiles(app.root, { "spa/SPA-1.md": taskFixture("SPA-1", { title: "Правка агента" }) });
    await app.emitChange([join(app.root, "spa/SPA-1.md")]);

    await screen.findByRole("link", { name: "Правка агента" });
    await settled();
    expect(loads.started - before).toBe(2);
  });
});
