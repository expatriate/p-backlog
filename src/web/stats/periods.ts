import { CHURN_DAYS } from "../../core/stats/code/churn";
import { pluralCount } from "../../core/stats/format";
import { STATS_WEEKS } from "../../core/stats/weeks";

export const CHURN_PERIOD = pluralCount(CHURN_DAYS, "день", "дня", "дней");
export const STATS_PERIOD = pluralCount(STATS_WEEKS, "неделю", "недели", "недель");
export const STATS_PERIOD_GENITIVE = pluralCount(STATS_WEEKS, "недели", "недель", "недель");
