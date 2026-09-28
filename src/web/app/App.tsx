import { Navigate, type RouteObject } from "react-router";
import { ROUTE_PATTERNS } from "../../core/api/web-paths";
import { useMessages } from "../i18n";
import { AppLayout } from "../layout/AppLayout";
import { TaskListPage } from "../list/TaskListPage";
import { STATS_TABS } from "../stats/stats-tabs";
import styles from "./App.module.css";
import { useLiveUpdates } from "./live-updates";

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
      { path: ROUTE_PATTERNS.task, element: <TaskListPage /> },
      { path: ROUTE_PATTERNS.projectList, element: <TaskListPage /> },
      { path: ROUTE_PATTERNS.projectTask, element: <TaskListPage /> },
      { path: ROUTE_PATTERNS.stats, lazy: loadStatsPage, children: STATS_TAB_ROUTES },
      { path: ROUTE_PATTERNS.projectStats, lazy: loadStatsPage, children: STATS_TAB_ROUTES },
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
