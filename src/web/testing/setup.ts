import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

afterEach(() => {
  cleanup();
  localStorage.clear();
});
