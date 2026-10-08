export type SignalKind = "debt-growing" | "urgent-stale" | "stuck" | "noisy-check" | "low-changed" | "stale-low";

export type ShownSignal = { kind: SignalKind };

export type SignalsShown = Partial<Record<SignalKind, string>>;

export function markShown(shown: SignalsShown, signals: readonly ShownSignal[], today: string): SignalsShown {
  return { ...shown, ...Object.fromEntries(signals.map((signal) => [signal.kind, today])) };
}
