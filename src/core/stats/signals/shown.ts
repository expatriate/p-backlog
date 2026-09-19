import type { Signal } from "../types";

export type SignalsShown = Record<string, string>;

export function signalsToShow(signals: readonly Signal[], shown: SignalsShown, today: string): Signal[] {
  return signals.filter((signal) => shown[signal.kind] !== today);
}

export function markShown(shown: SignalsShown, signals: readonly Signal[], today: string): SignalsShown {
  return { ...shown, ...Object.fromEntries(signals.map((signal) => [signal.kind, today])) };
}
