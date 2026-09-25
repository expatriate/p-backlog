export const ACTIONS_SHORTCUT = "Alt+A";

export function actionsShortcutLabel(): string {
  return /Mac|iPhone|iPad/.test(navigator.platform) ? "⌥A" : ACTIONS_SHORTCUT;
}

export function isActionsShortcut(event: KeyboardEvent): boolean {
  return event.altKey && event.code === "KeyA" && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

export function offersKeyboardHints(): boolean {
  return !window.matchMedia("(hover: none)").matches;
}
