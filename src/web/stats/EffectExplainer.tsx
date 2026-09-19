import type { ReactNode } from "react";
import { NBSP, plural, pluralCount } from "../../core/stats/format";
import { MIN_FIXES_FOR_ESTIMATE } from "../../core/stats/effect/effect-report";
import type { EffectTotals } from "../../core/stats/types";
import { codeAndTests, formatApprox, formatLines, formatNoiseShare, isEstimated } from "./effect-format";
import { Panel } from "./Panel";
import styles from "./EffectExplainer.module.css";

export function EffectExplainer({ totals }: { totals: EffectTotals }) {
  return (
    <Panel title="Как считается выигрыш">
      <ol className={styles.steps}>
        <li>Каждая задача, заведённая по ходу работы, — правка, которую без беклога агент сделал бы в текущем пулреквесте. Выигрыш — строки, которые туда не попали.</li>
        <li>
          Исправленные — точно: строки коммита из причины закрытия, без lock-файлов, документации и картинок; коммит на несколько задач делится поровну. Не считаются задачи, закрытые без
          исправления, и исправленные без найденного коммита.
          <Now>
            {pluralCount(totals.fixedTasks, "задача", "задачи", "задач")} — {linesText(totals.fixedLines, false)}
          </Now>
        </li>
        <li>
          Ожидающие — оценка: медиана исправлений той же категории (если их не меньше {MIN_FIXES_FOR_ESTIMATE}), иначе всех исправлений.
          <Now>{pendingText(totals)}</Now>
        </li>
        <li>
          Код и тесты: тестовые файлы — *.test.*, *.spec.*, *_test.*, test_*.py и каталоги test, tests, __tests__, e2e, spec. Для ожидающих — доля тестов в тех же исправлениях.
          <Now>{codeAndTests(totals)}</Now>
        </li>
        <li>
          Шум без беклога = вынесено ÷ (строк в пулреквестах + оценка ожидающих); исправления уже внутри пулреквестов и не удваиваются. Окно — с внедрения беклога в проекте, не раньше 12
          недель.
          <Now>{noiseText(totals)}</Now>
        </li>
      </ol>
    </Panel>
  );
}

function Now({ children }: { children: ReactNode }) {
  return <span className={styles.now}>Сейчас: {children}</span>;
}

function linesText(lines: number, approx: boolean): string {
  return `${formatApprox(lines, approx)}${NBSP}${plural(Math.round(lines), "строка", "строки", "строк")}`;
}

function pendingText(totals: EffectTotals): string {
  if (totals.openTasks === 0) return "ожидающих нет";
  if (totals.estimatedLines === null) return `${pluralCount(totals.openTasks, "задача", "задачи", "задач")}, оценка появится после ${MIN_FIXES_FOR_ESTIMATE} исправлений`;
  const perTask = totals.estimatedLines / totals.openTasks;
  return `${pluralCount(totals.openTasks, "задача", "задачи", "задач")} ${linesText(totals.estimatedLines, true)}, в среднем ≈${NBSP}${formatLines(perTask)} на задачу`;
}

function noiseText(totals: EffectTotals): string {
  if (totals.noiseShare === null) return "нет коммитов после внедрения";
  const estimated = totals.estimatedLines ?? 0;
  const approx = isEstimated(totals.estimatedLines);
  return `${formatApprox(totals.deferredLines, approx)} ÷ (${formatLines(totals.realLines)} + ${formatApprox(estimated, approx)}) ${formatNoiseShare(totals.noiseShare)}`;
}
