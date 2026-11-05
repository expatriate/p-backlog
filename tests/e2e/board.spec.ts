import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { NOTICE_LIFETIME_MS } from "../../src/web/list/use-notice-lifetime";
import { E2E_BACKLOG_DIR } from "./backlog-dir";
import { writeServedProject } from "./served-project";

const projectDir = join(E2E_BACKLOG_DIR, "board");

const statusOnDisk = async (id: string) => /^status: (.+)$/m.exec(await readFile(join(projectDir, `${id}.md`), "utf8"))?.[1];

function column(page: Page, status: string): Locator {
  return page.getByRole("region", { name: "Доска задач" }).getByRole("region", { name: new RegExp(`^${status}`) });
}

async function openBoardWith(page: Page, path: string, titles: readonly string[]): Promise<void> {
  await rm(projectDir, { recursive: true, force: true });
  await writeServedProject(page.request, projectDir, {
    prefix: "BRD",
    tasks: Object.fromEntries(
      titles.map((title, index) => [`BRD-${index + 1}`, `---\nid: BRD-${index + 1}\ntitle: ${title}\nstatus: backlog\ncreated: 2026-09-10T10:${String(index).padStart(2, "0")}:00+03:00\n---\n`]),
    ),
  });
  await page.goto(path);
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

async function pickUpWithKeyboard(page: Page, card: Locator, id: string, from = "в беклоге") {
  await card.focus();
  await page.keyboard.press("Space");
  await expect(page.getByText(`${id} над колонкой «${from}»`)).toBeAttached();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function moveRightWithKeyboard(page: Page, card: Locator, id: string, { from = "в беклоге", to = "в работе" } = {}) {
  await pickUpWithKeyboard(page, card, id, from);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText(`${id} над колонкой «${to}»`)).toBeAttached();
  await page.keyboard.press("Space");
}

const bottomUncovered = (shown: Locator) =>
  shown.evaluate((element) => {
    const { left, right, bottom } = element.getBoundingClientRect();
    const visibleMiddle = (Math.max(left, 0) + Math.min(right, window.innerWidth)) / 2;
    const hit = document.elementFromPoint(visibleMiddle, bottom - 4);
    return hit !== null && (element.contains(hit) || hit.contains(element));
  });

test("карточку перетаскивают мышью в другую колонку — статус меняется в файле, «Отменить» возвращает его и фокус на карточку", async ({ page }) => {
  await openBoardWith(page, "/p/board?view=board", ["Перетащить мышью"]);

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
  await openBoardWith(page, "/p/board?view=board&sort=created&dir=asc", ["Первая", "Вторая", "Третья", "Четвёртая", "Пятая"]);
  const bottom = column(page, "в беклоге").getByRole("link", { name: "Пятая" });

  await moveRightWithKeyboard(page, bottom, "BRD-5");

  await expect(column(page, "в работе").getByRole("link", { name: "Пятая" })).toBeVisible();
  await expect.poll(() => statusOnDisk("BRD-5")).toBe("in-progress");
});

test("Esc при переносе с клавиатуры отменяет перенос и не закрывает открытую карточку задачи", async ({ page }) => {
  await openBoardWith(page, "/p/board/t/BRD-1?view=board", ["Открыта в панели", "Переносимая"]);
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
  await page.route("**/api/tasks/BRD-1", (route) => (route.request().method() === "PATCH" ? route.fulfill({ status: 500, json: { errors: ["диск недоступен"] } }) : route.fallback()));
  await openBoardWith(page, "/p/board?view=board", ["Не сохранится"]);

  await dragTo(page, column(page, "в беклоге").getByRole("link", { name: "Не сохранится" }), column(page, "в работе"));

  await expect(page.getByRole("alert").filter({ hasText: "Не удалось перенести BRD-1" })).toContainText("диск недоступен");
  await expect(column(page, "в беклоге").getByRole("link", { name: "Не сохранится" })).toBeVisible();
  expect(await statusOnDisk("BRD-1")).toBe("backlog");
});

test("ошибка переноса уходит вместе с уведомлением, а не висит над колонками до следующего переноса", async ({ page }) => {
  const { promise: answered, resolve: answer }: PromiseWithResolvers<void> = Promise.withResolvers();
  await page.route("**/api/tasks/BRD-1", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    await answered;
    return route.fulfill({ status: 500, json: { errors: ["диск недоступен"] } });
  });
  await openBoardWith(page, "/p/board?view=board", ["Не сохранится"]);

  await dragTo(page, column(page, "в беклоге").getByRole("link", { name: "Не сохранится" }), column(page, "в работе"));
  await page.clock.install();
  answer();

  const failure = page.getByRole("alert").filter({ hasText: "Не удалось перенести BRD-1" });
  await expect(failure).toBeVisible();
  await expect(page.getByRole("status").getByRole("alert")).toHaveCount(0);
  await page.clock.fastForward(NOTICE_LIFETIME_MS);
  await expect(failure).toHaveCount(0);
});

test("перенос, сохранившийся после чужого отказа, получает уведомление на полный срок", async ({ page }) => {
  const failing: PromiseWithResolvers<void> = Promise.withResolvers();
  const passing: PromiseWithResolvers<void> = Promise.withResolvers();
  for (const [id, held, answer] of [
    ["BRD-1", failing.promise, (route: Route) => route.fulfill({ status: 500, json: { errors: ["диск недоступен"] } })],
    ["BRD-2", passing.promise, (route: Route) => route.fallback()],
  ] as const) {
    await page.route(`**/api/tasks/${id}`, async (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      await held;
      return answer(route);
    });
  }
  await openBoardWith(page, "/p/board?view=board", ["Не сохранится", "Сохранится"]);

  await dragTo(page, column(page, "в беклоге").getByRole("link", { name: "Не сохранится" }), column(page, "в работе"));
  await dragTo(page, column(page, "в беклоге").getByRole("link", { name: "Сохранится" }), column(page, "в работе"));
  await page.clock.install();
  failing.resolve();
  await expect(page.getByRole("alert").filter({ hasText: "Не удалось перенести BRD-1" })).toBeVisible();
  await page.clock.fastForward(NOTICE_LIFETIME_MS - 1_000);
  passing.resolve();

  const undo = page.getByRole("button", { name: "Отменить" });
  await expect(undo).toBeVisible();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.clock.fastForward(2_000);
  await expect(undo).toBeVisible();
});

test("два переноса подряд, первый медленно падает — его карточка возвращается с ошибкой, вторая остаётся на новом месте", async ({ page }) => {
  await page.route("**/api/tasks/BRD-1", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    await new Promise((resolve) => setTimeout(resolve, 800));
    return route.fulfill({ status: 500, json: { errors: ["диск недоступен"] } });
  });
  await openBoardWith(page, "/p/board?view=board", ["Медленная", "Быстрая"]);

  await dragTo(page, column(page, "в беклоге").getByRole("link", { name: "Медленная" }), column(page, "в работе"));
  await dragTo(page, column(page, "в беклоге").getByRole("link", { name: "Быстрая" }), column(page, "заблокирована"));

  await expect(page.getByRole("alert").filter({ hasText: "Не удалось перенести BRD-1" })).toBeVisible();
  await expect(column(page, "в беклоге").getByRole("link", { name: "Медленная" })).toBeVisible();
  await expect(column(page, "заблокирована").getByRole("link", { name: "Быстрая" })).toBeVisible();
  await expect.poll(() => Promise.all([statusOnDisk("BRD-1"), statusOnDisk("BRD-2")])).toEqual(["backlog", "blocked"]);
});

test("перенос в «сделана», когда закрытые скрыты фильтром, — уведомление и «Отменить», фокус на кнопке", async ({ page }) => {
  await openBoardWith(page, "/p/board?view=board", ["Закрыть переносом"]);

  await dragTo(page, column(page, "в беклоге").getByRole("link", { name: "Закрыть переносом" }), column(page, "сделана"));

  const undo = page.getByRole("button", { name: "Отменить" });
  await expect(page.getByRole("status").filter({ hasText: "BRD-1: статус «сделана»" })).toBeVisible();
  await expect(undo).toBeFocused();
  await expect.poll(() => statusOnDisk("BRD-1")).toBe("done");

  await undo.click();

  await expect(column(page, "в беклоге").getByRole("link", { name: "Закрыть переносом" })).toBeVisible();
  await expect.poll(() => statusOnDisk("BRD-1")).toBe("backlog");
});

test("длинная колонка прокручивается внутри доски: заголовки видны, после переноса снизу «Отменить» на экране и ничего не сдвигается", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openBoardWith(
    page,
    "/p/board?view=board&sort=created&dir=asc",
    Array.from({ length: 30 }, (_, index) => `Карточка ${index + 1}`),
  );
  const backlog = column(page, "в беклоге");
  const last = backlog.getByRole("link", { name: "Карточка 30", exact: true });
  await last.evaluate((link) => link.scrollIntoView({ block: "nearest" }));
  await expect(last).toBeInViewport();
  const scrollTops = () => page.evaluate(() => [...document.querySelectorAll("main, main *")].filter((element) => element.scrollTop > 0).map((element) => Math.round(element.scrollTop)));
  const pageScrolled = await page.evaluate(() => document.querySelector("main > div")?.scrollTop ?? 0);
  const columnsTop = (await column(page, "в работе").boundingBox())?.y;

  await dragTo(page, last, column(page, "в работе"));

  await expect(page.getByRole("button", { name: "Отменить" })).toBeInViewport();
  await expect(backlog.getByRole("heading", { level: 2 })).toBeInViewport();
  const card = (title: string) => backlog.locator("li").filter({ has: page.getByRole("link", { name: title, exact: true }) });
  await card("Карточка 1").evaluate((item) => item.parentElement?.scrollTo({ top: 0 }));
  await card("Карточка 10").evaluate((item) => item.scrollIntoView({ block: "nearest" }));
  expect(await bottomUncovered(card("Карточка 10"))).toBe(true);
  await card("Карточка 29").evaluate((item) => item.parentElement?.scrollTo({ top: item.parentElement.scrollHeight }));
  expect(await bottomUncovered(card("Карточка 29"))).toBe(true);
  expect(await page.evaluate(() => document.querySelector("main > div")?.scrollTop ?? 0)).toBe(pageScrolled);
  expect((await column(page, "в работе").boundingBox())?.y).toBe(columnsTop);
  expect(await scrollTops()).not.toEqual([]);
});

test("второй перенос во время падающего первого — «Отменить» возвращает задачу туда, где она была на диске", async ({ page }) => {
  const firstFailure: PromiseWithResolvers<void> = Promise.withResolvers();
  let firstPatch = true;
  await page.route("**/api/tasks/BRD-1", async (route) => {
    if (route.request().method() !== "PATCH" || !firstPatch) return route.fallback();
    firstPatch = false;
    await firstFailure.promise;
    return route.fulfill({ status: 500, json: { errors: ["диск недоступен"] } });
  });
  await openBoardWith(page, "/p/board?view=board", ["Дважды"]);

  const card = column(page, "в беклоге").getByRole("link", { name: "Дважды" });
  await moveRightWithKeyboard(page, card, "BRD-1");
  await moveRightWithKeyboard(page, column(page, "в работе").getByRole("link", { name: "Дважды" }), "BRD-1", { from: "в работе", to: "заблокирована" });
  firstFailure.resolve();
  await expect.poll(() => statusOnDisk("BRD-1")).toBe("blocked");

  await page.getByRole("button", { name: "Отменить" }).click();

  await expect.poll(() => statusOnDisk("BRD-1")).toBe("backlog");
  await expect(column(page, "в беклоге").getByRole("link", { name: "Дважды" })).toBeVisible();
});

test("открытая по ссылке карточка внизу длинной колонки прокручена в видимую область", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openBoardWith(
    page,
    "/p/board?view=board",
    Array.from({ length: 30 }, (_, index) => `Карточка ${index + 1}`),
  );
  await page.goto("/p/board/t/BRD-30?view=board&sort=created&dir=asc");

  await expect(column(page, "в беклоге").getByRole("link", { name: "Карточка 30", exact: true })).toBeInViewport();
});

test("«Отменить» первого переноса, пока сохраняется второй, не стирает уведомление второго", async ({ page }) => {
  const secondSaved: PromiseWithResolvers<void> = Promise.withResolvers();
  await page.route("**/api/tasks/BRD-2", async (route) => {
    if (route.request().method() !== "PATCH") return route.fallback();
    await secondSaved.promise;
    return route.fallback();
  });
  await openBoardWith(page, "/p/board?view=board&sort=created&dir=asc", ["Первая", "Вторая"]);

  await dragTo(page, column(page, "в беклоге").getByRole("link", { name: "Первая" }), column(page, "в работе"));
  await expect.poll(() => statusOnDisk("BRD-1")).toBe("in-progress");
  const undoFirst = page.getByRole("button", { name: "Отменить" });
  await expect(undoFirst).toBeVisible();
  await moveRightWithKeyboard(page, column(page, "в беклоге").getByRole("link", { name: "Вторая" }), "BRD-2");
  await undoFirst.click();
  secondSaved.resolve();

  await expect.poll(() => Promise.all([statusOnDisk("BRD-1"), statusOnDisk("BRD-2")])).toEqual(["backlog", "in-progress"]);
  await expect(page.getByRole("status").filter({ hasText: "BRD-2: статус «в работе»" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Отменить" })).toBeVisible();
});

test("на узком экране уведомление о переносе с «Отменить» целиком в окне и не закрывает ни ссылку карточки в фокусе, ни низ докрученной доски", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openBoardWith(
    page,
    "/p/board?view=board&sort=created&dir=asc",
    Array.from({ length: 5 }, (_, index) => `Карточка ${index + 1}`),
  );

  await moveRightWithKeyboard(page, column(page, "в беклоге").getByRole("link", { name: "Карточка 1", exact: true }), "BRD-1");

  await expect(page.getByRole("button", { name: "Отменить" })).toBeInViewport({ ratio: 1 });
  const backlog = column(page, "в беклоге");
  const lowest = backlog.getByRole("link", { name: "Карточка 5", exact: true });
  expect(await bottomUncovered(lowest)).toBe(false);
  await lowest.focus();
  expect(await bottomUncovered(lowest)).toBe(true);
  await backlog.evaluate((element) => element.scrollIntoView({ inline: "start" }));
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight }));
  expect(await bottomUncovered(backlog)).toBe(true);
});
