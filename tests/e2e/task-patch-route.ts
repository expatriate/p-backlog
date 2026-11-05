import type { Page, Route } from "@playwright/test";

export async function routeTaskPatch(page: Page, id: string, answer: (route: Route) => Promise<void>): Promise<void> {
  await page.route(`**/api/tasks/${id}`, (route) => (route.request().method() === "PATCH" ? answer(route) : route.fallback()));
}

export const DISK_ERROR = "диск недоступен";

export async function failWithDiskError(route: Route): Promise<void> {
  await route.fulfill({ status: 500, json: { errors: [DISK_ERROR] } });
}
