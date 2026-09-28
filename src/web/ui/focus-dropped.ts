export function focusDropped(): boolean {
  return document.activeElement === null || document.activeElement === document.body;
}
