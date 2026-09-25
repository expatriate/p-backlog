import { cleanup, configure } from "@testing-library/react";
import { afterEach, vi } from "vitest";

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

// Lazy routes are compiled on first use, and on Windows that outlasts the default wait of findBy/waitFor.
if (process.platform === "win32") configure({ asyncUtilTimeout: 5_000 });

const focusedBeforeModal = new WeakMap<HTMLDialogElement, Element | null>();

HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
  focusedBeforeModal.set(this, document.activeElement);
  this.open = true;
};

HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
  if (!this.open) return;
  this.open = false;
  const opener = focusedBeforeModal.get(this);
  if (opener instanceof HTMLElement) opener.focus();
  setTimeout(() => this.dispatchEvent(new Event("close")));
};

Element.prototype.scrollIntoView ??= () => undefined;

export const hoverNone = { matches: false };

window.matchMedia ??= (query: string) => ({ matches: query === "(hover: none)" && hoverNone.matches, media: query }) as MediaQueryList;

afterEach(() => {
  cleanup();
  localStorage.clear();
  hoverNone.matches = false;
});
