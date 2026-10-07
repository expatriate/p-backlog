import { screen, within } from "@testing-library/react";
import type { BatchRequest } from "../../core/api/contract";
import { projectFile, taskFile } from "../../core/store/testing/temp-dirs";
import { accessDenied, interceptApi, type RenderedApp } from "./render-app";

export const LIST_FILES = {
  "spa/project.md": projectFile("SPA"),
  "spa/SPA-1.md": taskFile("SPA-1", { title: "Таймауты загрузки", priority: "high", tags: "[upload]", created: "2026-09-10T10:00:00+03:00" }),
  "spa/SPA-2.md": taskFile("SPA-2", { title: "Починить логин", priority: "low", status: "done", created: "2026-09-12T10:00:00+03:00" }),
  "spa/SPA-3.md": taskFile("SPA-3", { title: "Разобрать очередь", priority: "critical", created: "2026-09-14T10:00:00+03:00" }),
  "torg-io/project.md": projectFile("TI"),
  "torg-io/TI-1.md": taskFile("TI-1", { title: "Каталог тормозит" }),
};

export async function rowTitles(): Promise<string[]> {
  const rows = await screen.findAllByRole("row");
  return rows.slice(1).map((row) => within(row).getAllByRole("link")[1]?.textContent ?? "");
}

type FailWhen = (body: BatchRequest, attempt: number) => boolean;

export function recordBatches(failWhen: FailWhen = () => false) {
  const sent: BatchRequest[] = [];
  const beforeRender = interceptApi(async (path, init, passOn) => {
    if (path !== "/api/tasks/batch") return passOn();
    const body = JSON.parse(String(init?.body)) as BatchRequest;
    sent.push(body);
    return failWhen(body, sent.length) ? accessDenied() : passOn();
  });
  return { sent, beforeRender };
}

export async function select(app: RenderedApp, ...ids: string[]) {
  await screen.findAllByRole("row");
  for (const id of ids) await app.user.click(screen.getByRole("checkbox", { name: `Выбрать ${id}` }));
}
