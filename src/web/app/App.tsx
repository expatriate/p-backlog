import type { RouteObject } from "react-router";
import { AppLayout } from "../layout/AppLayout";
import { TaskListPage } from "../list/TaskListPage";
import { useLiveUpdates } from "./queries";

export const routes: RouteObject[] = [
  {
    element: <LiveApp />,
    children: [
      { index: true, element: <TaskListPage /> },
      { path: "t/:taskId", element: <TaskListPage /> },
      { path: "p/:projectId", element: <TaskListPage /> },
      { path: "p/:projectId/t/:taskId", element: <TaskListPage /> },
    ],
  },
];

function LiveApp() {
  useLiveUpdates();
  return <AppLayout />;
}
