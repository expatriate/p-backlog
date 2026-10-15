export type SignalKind = "debt-growing" | "urgent-stale" | "stuck" | "done-unclosed" | "noisy-check" | "low-changed" | "stale-low";

export type ShownSignal = { kind: SignalKind };

export type SignalsShown = Partial<Record<SignalKind, string>>;

export function markShown(shown: SignalsShown, signals: readonly ShownSignal[], today: string): SignalsShown {
  return { ...shown, ...Object.fromEntries(signals.map((signal) => [signal.kind, today])) };
}

export function signalsToShow<T extends ShownSignal>(signals: readonly T[], shown: SignalsShown, today: string): T[] {
  return signals.filter((signal) => shown[signal.kind] !== today);
}
