import { Navigate, type RouteObject } from "react-router";
import { AppLayout } from "../layout/AppLayout";
import { TaskListPage } from "../list/TaskListPage";
import styles from "./App.module.css";
import { useLiveUpdates } from "./queries";

const STATS_TAB_ROUTES: RouteObject[] = [
  { index: true, lazy: async () => ({ Component: (await import("../stats/OverviewTab")).OverviewTab }) },
  { path: "flow", element: <Navigate to=".." relative="path" replace /> },
  { path: "code", lazy: async () => ({ Component: (await import("../stats/CodeTab")).CodeTab }) },
  { path: "quality", lazy: async () => ({ Component: (await import("../stats/QualityTab")).QualityTab }) },
  { path: "effect", lazy: async () => ({ Component: (await import("../stats/EffectTab")).EffectTab }) },
  { path: "cost", lazy: async () => ({ Component: (await import("../stats/CostTab")).CostTab }) },
];

const loadStatsPage = async () => ({ Component: (await import("../stats/StatsPage")).StatsPage });

export const routes: RouteObject[] = [
  {
    element: <LiveApp />,
    errorElement: <CrashScreen />,
    children: [
      { index: true, element: <TaskListPage /> },
      { path: "t/:taskId", element: <TaskListPage /> },
      { path: "p/:projectId", element: <TaskListPage /> },
      { path: "p/:projectId/t/:taskId", element: <TaskListPage /> },
      { path: "stats", lazy: loadStatsPage, children: STATS_TAB_ROUTES },
      { path: "p/:projectId/stats", lazy: loadStatsPage, children: STATS_TAB_ROUTES },
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
