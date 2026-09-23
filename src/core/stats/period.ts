export type Period = { from: number; to: number; contains: (moment: number) => boolean };

export function period(from: number, to: number): Period {
  return { from, to, contains: (moment) => moment >= from && moment <= to };
}

export function consecutivePeriods(starts: readonly Date[], lastTo: number): Period[] {
  return starts.map((start, index) => period(start.getTime(), (starts[index + 1]?.getTime() ?? lastTo + 1) - 1));
}
