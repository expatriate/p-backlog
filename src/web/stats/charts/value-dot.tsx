import type { DotItemDotProps } from "recharts";

const DOT_RADIUS = 3.5;

export function nonZeroDot(color: string) {
  return function NonZeroDot({ cx, cy, value, index }: DotItemDotProps) {
    if (typeof value !== "number" || value === 0 || cx === undefined || cy === undefined) return <g key={index} />;
    return <circle key={index} cx={cx} cy={cy} r={DOT_RADIUS} fill={color} stroke="var(--surface-raised)" strokeWidth={1.5} />;
  };
}
