import { matchRoutes, useLocation, useNavigation } from "react-router";
import { ROUTE_PATTERNS, statsTabRoute } from "../../core/api/web-paths";
import { STATS_TABS, type StatsTab } from "./stats-tabs";

type StatsRoute = { tab: StatsTab; projectId: string | undefined };

const STATS_TAB_ROUTES = STATS_TABS.flatMap((tab) => [ROUTE_PATTERNS.stats, ROUTE_PATTERNS.projectStats].map((root) => ({ tab, path: statsTabRoute(root, tab.key) })));

export function useStatsTab(): StatsTab | undefined {
  return statsRouteAt(useLocation().pathname)?.tab;
}

export function usePendingStatsTab(projectId: string | undefined): StatsTab | undefined {
  const pendingPathname = useNavigation().location?.pathname;
  const pending = pendingPathname === undefined ? undefined : statsRouteAt(pendingPathname);
  return pending !== undefined && pending.projectId === projectId ? pending.tab : undefined;
}

function statsRouteAt(pathname: string): StatsRoute | undefined {
  const match = matchRoutes(STATS_TAB_ROUTES, pathname)?.[0];
  return match === undefined ? undefined : { tab: match.route.tab, projectId: match.params.projectId };
}
