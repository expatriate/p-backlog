import type { Swatch } from "./ChartFrame";

type NumberKey<Row> = { [Key in keyof Row]-?: Row[Key] extends number | null ? Key : never }[keyof Row] & string;

type SeriesOf<Row, Key extends keyof Row> = Swatch & {
  key: Key;
  label: string;
  tooltipLabel?: string;
  format: (value: Row[Key], row: Row) => string;
  axis?: "right";
  stack?: string;
  sparse?: true;
};

export type Series<Row> = { [Key in NumberKey<Row>]: SeriesOf<Row, Key> }[NumberKey<Row>];

type TooltipNote<Row> = { label: string; format: (row: Row) => string; shape?: never; tooltipLabel?: never };

export type SeriesEntry<Row> = Series<Row> | TooltipNote<Row>;

export function isPlotted<Row>(entry: SeriesEntry<Row>): entry is Series<Row> {
  return entry.shape !== undefined;
}

export function tooltipValue<Row>(entry: SeriesEntry<Row>, row: Row): string {
  return isPlotted(entry) ? entry.format(row[entry.key], row) : entry.format(row);
}
