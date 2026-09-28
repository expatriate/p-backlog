import type { DotItemDotProps } from "recharts";

const DOT_RADIUS = 3.5;
const DOT_RING_WIDTH = 1.5;

export function nonZeroDot(color: string) {
  return dotWhere(color, (value) => value !== 0);
}

export function valueDot(color: string) {
  return dotWhere(color, () => true);
}

function dotWhere(color: string, isMarked: (value: number) => boolean) {
  return function ValueDot({ cx, cy, value, index }: DotItemDotProps) {
    if (typeof value !== "number" || !isMarked(value) || cx === undefined || cy === undefined) return <g key={index} />;
    return <circle key={index} cx={cx} cy={cy} r={DOT_RADIUS} fill={color} stroke="var(--surface-raised)" strokeWidth={DOT_RING_WIDTH} />;
  };
}
