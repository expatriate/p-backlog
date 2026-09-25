import { Navigate, type RouteObject } from "react-router";
import { useMessages } from "../i18n";
import { AppLayout } from "../layout/AppLayout";
import { TaskListPage } from "../list/TaskListPage";
import { STATS_TABS } from "../stats/stats-tabs";
import styles from "./App.module.css";
import { useLiveUpdates } from "./queries";

const STATS_TAB_ROUTES: RouteObject[] = [
  ...STATS_TABS.map((tab): RouteObject => (tab.segment === "" ? { index: true, lazy: tab.load } : { path: tab.segment, lazy: tab.load })),
  { path: "flow", element: <Navigate to=".." relative="path" replace /> },
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
  const { app } = useMessages();
  return (
    <main className={styles.crash} role="alert">
      <h1>{app.crashTitle}</h1>
      <p>{app.crashHint}</p>
    </main>
  );
}
