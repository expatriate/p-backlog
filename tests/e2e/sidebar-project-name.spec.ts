import { expect, test } from "@playwright/test";
import type { ProjectsResponse, ProjectView } from "../../src/core/api/contract";

const longName = "очень-длинное-имя-проекта-которое-не-влезает-в-сайдбар";
const longProject: ProjectView = { id: "long", name: longName, prefix: "LONG", repos: [], active: true, extra: {}, body: "", path: "/long/project.md", codeGraph: "none" };

for (const width of [1280, 320]) {
  test(`длинное имя проекта в сайдбаре обрезается до кнопки удаления и не даёт прокрутки по ширине на ${width}px`, async ({ page }) => {
    await page.route("**/api/projects", async (route) => {
      const response = await route.fetch();
      const { revision } = (await response.json()) as ProjectsResponse;
      await route.fulfill({ response, json: { projects: [longProject], revision } satisfies ProjectsResponse });
    });

    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");
    const row = page.getByRole("list", { name: "Проекты" }).getByRole("listitem");
    const deleteButton = row.getByRole("button", { name: `Удалить проект ${longName}` });
    await expect(deleteButton).toBeVisible();

    const nameBox = await row.getByTitle(longName).boundingBox();
    const deleteBox = await deleteButton.boundingBox();
    if (nameBox === null || deleteBox === null) throw new Error("строка проекта не отрисована");
    expect(nameBox.x + nameBox.width).toBeLessThanOrEqual(deleteBox.x);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  });
}
