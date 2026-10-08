import type { SignalsShown } from "../../model/signals-shown";
import type { Signal } from "../types";

export function signalsToShow(signals: readonly Signal[], shown: SignalsShown, today: string): Signal[] {
  return signals.filter((signal) => shown[signal.kind] !== today);
}
