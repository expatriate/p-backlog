import { cleanup, configure } from "@testing-library/react";
import { afterEach, vi } from "vitest";

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

// Lazy routes are compiled on first use, which takes over a second on Windows CI runners.
configure({ asyncUtilTimeout: 5_000 });

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

afterEach(() => {
  cleanup();
  localStorage.clear();
});
