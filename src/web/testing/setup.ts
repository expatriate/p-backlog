import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

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
  this.dispatchEvent(new Event("close"));
};

Element.prototype.scrollIntoView ??= () => undefined;

afterEach(() => {
  cleanup();
  localStorage.clear();
});
