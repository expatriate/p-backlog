import type { ReactNode } from "react";
import type { Language } from "../../core/i18n/language";
import type { EffectTotals } from "../../core/api/contract";
import { useLanguage, useMessages } from "../i18n";
import { formatLines, formatNoiseShare } from "./effect-format";
import type { StatsMessages } from "./messages.ru";
import { Panel } from "./Panel";
import styles from "./EffectExplainer.module.css";
import { formatWhole } from "./value-format";

export function EffectExplainer({ totals }: { totals: EffectTotals }) {
  const { stats } = useMessages();
  const language = useLanguage();
  return (
    <Panel title={stats.explainerTitle}>
      <ol className={styles.steps}>
        <li>{stats.explainerTask}</li>
        <li>
          {stats.explainerFixed}
          <Now>{stats.fixedNow(totals.fixedTasks, totals.fixedLines)}</Now>
        </li>
        <li>
          {stats.explainerPending}
          <Now>{pendingText(stats, totals)}</Now>
        </li>
        <li>
          {stats.explainerTests}
          <Now>{stats.codeAndTests(totals)}</Now>
        </li>
        <li>
          {stats.explainerNoise}
          <Now>{noiseText(stats, language, totals)}</Now>
        </li>
      </ol>
    </Panel>
  );
}

function Now({ children }: { children: ReactNode }) {
  const { stats } = useMessages();
  return (
    <span className={styles.now}>
      {stats.now} {children}
    </span>
  );
}

function pendingText(stats: StatsMessages, totals: EffectTotals): string {
  if (totals.openTasks === 0) return stats.noPending;
  if (totals.estimatedLines === null) return stats.pendingWithoutEstimate(totals.openTasks);
  return stats.pendingEstimated(totals.openTasks, totals.estimatedLines, totals.estimatedLines / totals.openTasks);
}

function noiseText(stats: StatsMessages, language: Language, totals: EffectTotals): string {
  if (totals.estimatedLines === null && totals.openTasks > 0) return stats.estimateLater;
  if (totals.noiseShare === null) return stats.noCommitsSinceAdoption;
  const lines = (value: number) => formatLines(language, value, totals.estimatedLines);
  return stats.noiseFormula(lines(totals.deferredLines), formatWhole(language, totals.realLines), lines(totals.estimatedLines ?? 0), formatNoiseShare(totals.noiseShare, totals.estimatedLines));
}
