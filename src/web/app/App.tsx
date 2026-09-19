import type { RouteObject } from "react-router";
import { AppLayout } from "../layout/AppLayout";
import { TaskListPage } from "../list/TaskListPage";
import { CodeTab } from "../stats/CodeTab";
import { FlowTab } from "../stats/FlowTab";
import { OverviewTab } from "../stats/OverviewTab";
import { QualityTab } from "../stats/QualityTab";
import { StatsPage } from "../stats/StatsPage";
import styles from "./App.module.css";
import { useLiveUpdates } from "./queries";

const STATS_TAB_ROUTES: RouteObject[] = [
  { index: true, element: <OverviewTab /> },
  { path: "flow", element: <FlowTab /> },
  { path: "code", element: <CodeTab /> },
  { path: "quality", element: <QualityTab /> },
];

export const routes: RouteObject[] = [
  {
    element: <LiveApp />,
    errorElement: <CrashScreen />,
    children: [
      { index: true, element: <TaskListPage /> },
      { path: "t/:taskId", element: <TaskListPage /> },
      { path: "p/:projectId", element: <TaskListPage /> },
      { path: "p/:projectId/t/:taskId", element: <TaskListPage /> },
      { path: "stats", element: <StatsPage />, children: STATS_TAB_ROUTES },
      { path: "p/:projectId/stats", element: <StatsPage />, children: STATS_TAB_ROUTES },
    ],
  },
];

function LiveApp() {
  useLiveUpdates();
  return <AppLayout />;
}

function CrashScreen() {
  return (
    <main className={styles.crash} role="alert">
      <h1>Интерфейс беклога сломался</h1>
      <p>Обновите страницу. Если ошибка повторится, перезапустите сервер беклога.</p>
    </main>
  );
}
