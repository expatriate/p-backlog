import { useSyncExternalStore } from "react";
import { isApplePlatform } from "../ui/platform";

export const ACTIONS_SHORTCUT = "Alt+A";

export function actionsShortcutLabel(): string {
  return isApplePlatform() ? "⌥A" : ACTIONS_SHORTCUT;
}

export function isActionsShortcut(event: KeyboardEvent): boolean {
  return event.altKey && event.code === "KeyA" && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

const NO_HOVER_QUERY = "(hover: none)";

export function useKeyboardHints(): boolean {
  return useSyncExternalStore(subscribeToHoverChange, () => !window.matchMedia(NO_HOVER_QUERY).matches);
}

function subscribeToHoverChange(onChange: () => void): () => void {
  const query = window.matchMedia(NO_HOVER_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
