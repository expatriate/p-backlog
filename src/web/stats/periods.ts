import { CHURN_DAYS } from "../../core/code/code-window";
import { countRu } from "../../core/i18n/plural";
import { STATS_WEEKS } from "../../core/stats/weeks";

export const CHURN_PERIOD = countRu(CHURN_DAYS, "день", "дня", "дней");
export const STATS_PERIOD = countRu(STATS_WEEKS, "неделю", "недели", "недель");
export const STATS_PERIOD_GENITIVE = countRu(STATS_WEEKS, "недели", "недель", "недель");
