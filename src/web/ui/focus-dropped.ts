export function focusDropped(): boolean {
  const active = document.activeElement;
  return active === null || active === document.body || active.matches("main");
}
