import { matchPath, useLocation, useNavigation } from "react-router";
import { ROUTE_PATTERNS } from "../../core/api/web-paths";
import { STATS_TABS, type StatsTab } from "./stats-tabs";

type StatsRoute = { tab: StatsTab; projectId: string | undefined };

const STATS_TAB_PATTERNS = STATS_TABS.flatMap((tab) => [ROUTE_PATTERNS.stats, ROUTE_PATTERNS.projectStats].map((root) => ({ tab, path: tab.segment === "" ? root : `${root}/${tab.segment}` })));

export function useStatsTab(): StatsTab | undefined {
  return statsRouteAt(useLocation().pathname)?.tab;
}

export function usePendingStatsTab(projectId: string | undefined): StatsTab | undefined {
  const pendingPathname = useNavigation().location?.pathname;
  const pending = pendingPathname === undefined ? undefined : statsRouteAt(pendingPathname);
  return pending !== undefined && pending.projectId === projectId ? pending.tab : undefined;
}

function statsRouteAt(pathname: string): StatsRoute | undefined {
  const matches = STATS_TAB_PATTERNS.flatMap(({ tab, path }): StatsRoute[] => {
    const match = matchPath({ path, end: true }, pathname);
    return match === null ? [] : [{ tab, projectId: match.params.projectId }];
  });
  return matches[0];
}
