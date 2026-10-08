import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createBrowserRouter, Link, Outlet, RouterProvider, useParams } from "react-router";
import { afterEach, describe, expect, it, onTestFinished } from "vitest";
import { ROUTE_PATTERNS, statsTabPath } from "../../core/api/web-paths";
import { usePendingStatsTab } from "./use-stats-tab";

function PendingTab() {
  const { projectId } = useParams();
  const pending = usePendingStatsTab(projectId);
  return (
    <>
      <Link to={statsTabPath("code", projectId)}>Код</Link>
      <p>ждём: {pending?.key ?? "ничего"}</p>
      <Outlet />
    </>
  );
}

afterEach(() => window.history.replaceState(null, "", "/"));

describe("вкладка статистики, которая ещё грузится", () => {
  it("подсвечивается и для проекта, чей id в адресе кодируется", async () => {
    const chunk = new Promise<never>(() => {});
    window.history.replaceState(null, "", "/p/мой проект/stats");
    const router = createBrowserRouter([
      {
        path: ROUTE_PATTERNS.projectStats,
        Component: PendingTab,
        children: [
          { index: true, element: null },
          { path: "code", lazy: () => chunk },
        ],
      },
    ]);
    onTestFinished(() => router.dispose());
    render(<RouterProvider router={router} />);

    await userEvent.setup().click(screen.getByRole("link", { name: "Код" }));

    expect(await screen.findByText("ждём: code")).toBeDefined();
  });
});
