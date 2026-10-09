import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccuracyPeriod } from "../../../core/api/contract";
import { NBSP } from "../../../core/i18n/plural";
import { TestMessagesProvider } from "../../testing/messages-provider";
import { AccuracyChart } from "../AccuracyChart";
import { PeriodChart } from "./PeriodChart";
import type { SeriesEntry } from "./series";

type Row = { start: string; created: number; open: number };

const ROWS: Row[] = [
  { start: "2026-09-14", created: 3, open: 4_000 },
  { start: "2026-09-21", created: 5, open: 8_000 },
];

const formatCount = (value: number) => String(value);

const CREATED: SeriesEntry<Row> = { key: "created", label: "создано", shape: "bar", color: "var(--chart-bar-neutral)", format: formatCount };
const OPEN: SeriesEntry<Row> = { key: "open", label: "открыто", shape: "line", color: "var(--chart-line-bright)", axis: "right", format: formatCount };

function renderChart(series: SeriesEntry<Row>[]) {
  return render(
    <TestMessagesProvider>
      <PeriodChart name="Долг" summary="сводка" grain="week" data={ROWS} series={series} />
    </TestMessagesProvider>,
  );
}

const tickLabels = (container: HTMLElement) => [...container.querySelectorAll(".recharts-yAxis-tick-labels")].map((axis) => axis.textContent);

describe("оси значений графика", () => {
  beforeEach(() => {
    const measured = HTMLElement.prototype.getBoundingClientRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("recharts-responsive-container") ? new DOMRect(0, 0, 360, 220) : measured.call(this);
    });
  });

  it("ось «решено» точности подписана компактно, как оси остальных счётчиков", () => {
    const periods: AccuracyPeriod[] = [{ start: "2026-09-14", decided: 1200, precision: 0.5 }];

    const { container } = render(
      <TestMessagesProvider>
        <AccuracyChart periods={periods} grain="week" />
      </TestMessagesProvider>,
    );

    expect(tickLabels(container)[0]).toContain(`1,2${NBSP}тыс.`);
  });

  it("серия справа без настроек правой оси рисует видимую правую ось с компактными подписями", () => {
    const { container } = renderChart([CREATED, OPEN]);

    expect(tickLabels(container)).toHaveLength(2);
    expect(tickLabels(container)[1]).toContain(`8${NBSP}тыс.`);
  });

  it("у графика с двумя осями есть сетка внутри области, а не только верхняя и нижняя граница", () => {
    const { container } = renderChart([CREATED, OPEN]);

    expect(container.querySelectorAll(".recharts-cartesian-grid-horizontal line").length).toBeGreaterThan(2);
  });
});
