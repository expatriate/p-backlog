import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { E2E_BACKLOG_DIR } from "./backlog-dir";

const projectDir = join(E2E_BACKLOG_DIR, "board");

const statusOnDisk = async (id: string) => /^status: (.+)$/m.exec(await readFile(join(projectDir, `${id}.md`), "utf8"))?.[1];

async function writeBoard(titles: readonly string[]) {
  await rm(projectDir, { recursive: true, force: true });
  await mkdir(projectDir, { recursive: true });
  await writeFile(join(projectDir, "project.md"), "---\nname: board\nprefix: BRD\nrepos: []\n---\n", "utf8");
  for (const [index, title] of titles.entries()) {
    const id = `BRD-${index + 1}`;
    await writeFile(join(projectDir, `${id}.md`), `---\nid: ${id}\ntitle: ${title}\nstatus: backlog\ncreated: 2026-09-${10 + index}T10:00:00+03:00\n---\n`, "utf8");
  }
}

function column(page: Page, status: string): Locator {
  return page.getByRole("region", { name: "Доска задач" }).getByRole("region", { name: new RegExp(`^${status}`) });
}

async function openBoard(page: Page, path: string, firstCard: string): Promise<void> {
  await page.goto(path);
  await expect(column(page, "в беклоге").getByRole("link", { name: firstCard })).toBeVisible();
}

async function dragTo(page: Page, card: Locator, target: Locator) {
  const from = await card.boundingBox();
  const to = await target.boundingBox();
  if (from === null || to === null) throw new Error("карточка или колонка не видны");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + 60, { steps: 12 });
  await page.mouse.up();
}

async function pickUpWithKeyboard(page: Page, card: Locator, id: string) {
  await card.focus();
  await page.keyboard.press("Space");
  await expect(page.getByText(`${id} над колонкой «в беклоге»`)).toBeAttached();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

test("карточку перетаскивают мышью в другую колонку — статус меняется в файле, «Отменить» возвращает его и фокус на карточку", async ({ page }) => {
  await writeBoard(["Перетащить мышью"]);
  await openBoard(page, "/p/board?view=board", "Перетащить мышью");

  await dragTo(page, column(page, "в беклоге").getByRole("link", { name: "Перетащить мышью" }), column(page, "в работе"));

  await expect(column(page, "в работе").getByRole("link", { name: "Перетащить мышью" })).toBeVisible();
  await expect.poll(() => statusOnDisk("BRD-1")).toBe("in-progress");
  await expect(page).toHaveURL(/\/p\/board\?view=board$/);

  await page.getByRole("button", { name: "Отменить" }).click();

  const restored = column(page, "в беклоге").getByRole("link", { name: "Перетащить мышью" });
  await expect(restored).toBeFocused();
  await expect.poll(() => statusOnDisk("BRD-1")).toBe("backlog");
});

test("с клавиатуры нижнюю карточку длинной колонки переносят в пустую: пробел, стрелка вправо, пробел", async ({ page }) => {
  await writeBoard(["Первая", "Вторая", "Третья", "Четвёртая", "Пятая"]);
  await openBoard(page, "/p/board?view=board&sort=created&dir=asc", "Пятая");
  const bottom = column(page, "в беклоге").getByRole("link", { name: "Пятая" });

  await pickUpWithKeyboard(page, bottom, "BRD-5");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("BRD-5 над колонкой «в работе»")).toBeAttached();
  await page.keyboard.press("Space");

  await expect(column(page, "в работе").getByRole("link", { name: "Пятая" })).toBeVisible();
  await expect.poll(() => statusOnDisk("BRD-5")).toBe("in-progress");
});

test("Esc при переносе с клавиатуры отменяет перенос и не закрывает открытую карточку задачи", async ({ page }) => {
  await writeBoard(["Открыта в панели", "Переносимая"]);
  await openBoard(page, "/p/board/t/BRD-1?view=board", "Переносимая");
  const panel = page.getByRole("complementary", { name: "Задача BRD-1" });
  await expect(panel).toBeVisible();

  await pickUpWithKeyboard(page, column(page, "в беклоге").getByRole("link", { name: "Переносимая" }), "BRD-2");
  await page.keyboard.press("Escape");

  await expect(page.getByText("Перенос BRD-2 отменён")).toBeAttached();
  await expect(page).toHaveURL(/\/p\/board\/t\/BRD-1\?view=board$/);
  await expect(panel).toBeVisible();
  expect(await statusOnDisk("BRD-2")).toBe("backlog");
});

test("сервер отказал — карточка возвращается в свою колонку, причина видна по-русски", async ({ page }) => {
  await writeBoard(["Не сохранится"]);
  await page.route("**/api/tasks/BRD-1", (route) => (route.request().method() === "PATCH" ? route.fulfill({ status: 500, json: { errors: ["диск недоступен"] } }) : route.fallback()));
  await openBoard(page, "/p/board?view=board", "Не сохранится");

  await dragTo(page, column(page, "в беклоге").getByRole("link", { name: "Не сохранится" }), column(page, "в работе"));

  await expect(page.getByRole("alert").filter({ hasText: "Не удалось перенести BRD-1" })).toContainText("диск недоступен");
  await expect(column(page, "в беклоге").getByRole("link", { name: "Не сохранится" })).toBeVisible();
  expect(await statusOnDisk("BRD-1")).toBe("backlog");
});

test("два переноса подряд, первый медленно падает — его карточка возвращается с ошибкой, вторая остаётся на новом месте", async ({ page }) => {
  await writeBoard(["Медленная", "Быстрая"]);
  await page.route("**/api/tasks/BRD-1", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    await new Promise((resolve) => setTimeout(resolve, 800));
    return route.fulfill({ status: 500, json: { errors: ["диск недоступен"] } });
  });
  await openBoard(page, "/p/board?view=board", "Медленная");

  await dragTo(page, column(page, "в беклоге").getByRole("link", { name: "Медленная" }), column(page, "в работе"));
  await dragTo(page, column(page, "в беклоге").getByRole("link", { name: "Быстрая" }), column(page, "заблокирована"));

  await expect(page.getByRole("alert").filter({ hasText: "Не удалось перенести BRD-1" })).toBeVisible();
  await expect(column(page, "в беклоге").getByRole("link", { name: "Медленная" })).toBeVisible();
  await expect(column(page, "заблокирована").getByRole("link", { name: "Быстрая" })).toBeVisible();
  await expect.poll(() => Promise.all([statusOnDisk("BRD-1"), statusOnDisk("BRD-2")])).toEqual(["backlog", "blocked"]);
});
