export const CHART_MARGIN = { top: 8, right: 4, bottom: 0, left: 4 };
export const AXIS_PROPS = { tickLine: false, axisLine: false } as const;
export const DATE_AXIS_PROPS = { ...AXIS_PROPS, interval: "preserveStartEnd", minTickGap: 16 } as const;
export const VALUE_AXIS_WIDTH = 60;
export const TOOLTIP_PROPS = { isAnimationActive: false, cursor: { fill: "var(--surface-hover)" } } as const;

export function chartTitle(name: string, step: "дням" | "неделям" | "замерам"): string {
  return `${name}. Стрелки влево и вправо — по ${step}`;
}
export const BAR_RADIUS: [number, number, number, number] = [2, 2, 0, 0];
export const LINE_WIDTH = 2;
export const DASHED_LINE = "4 3";
