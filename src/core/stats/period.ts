export type Span = { contains: (moment: number) => boolean };

export type Period = Span & { from: number; to: number };

export function period(from: number, to: number): Period {
  return { from, to, contains: (moment) => moment >= from && moment <= to };
}

export function trailingSpan(to: number, lengthMs: number): Span {
  const after = to - lengthMs;
  return { contains: (moment) => moment > after && moment <= to };
}

export function consecutivePeriods(starts: readonly Date[], lastTo: number): Period[] {
  return starts.map((start, index) => {
    const next = starts[index + 1];
    return period(start.getTime(), next === undefined ? lastTo : next.getTime() - 1);
  });
}
