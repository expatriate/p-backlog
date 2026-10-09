import { Navigate, type RouteObject } from "react-router";
import { ROUTE_PATTERNS, statsTabSegment } from "../../core/api/web-paths";
import { useMessages } from "../i18n";
import { AppLayout } from "../layout/AppLayout";
import { TaskListPage } from "../list/TaskListPage";
import { STATS_TABS } from "../stats/stats-tabs";
import { PageMessage } from "../ui/Page";
import styles from "./App.module.css";
import { useLiveUpdates } from "./live-updates";

const LEGACY_FLOW_TAB_ALIAS: RouteObject = { path: "flow", element: <Navigate to=".." relative="path" replace /> };

const STATS_TAB_ROUTES: RouteObject[] = [
  ...STATS_TABS.map((tab): RouteObject => {
    const segment = statsTabSegment(tab.key);
    return segment === null ? { index: true, lazy: tab.load } : { path: segment, lazy: tab.load };
  }),
  LEGACY_FLOW_TAB_ALIAS,
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
    <PageMessage as="main" className={styles.crash} role="alert">
      <h1>{app.crashTitle}</h1>
      <p>{app.crashHint}</p>
    </PageMessage>
  );
}
