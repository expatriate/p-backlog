import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { TestMessagesProvider } from "../testing/messages-provider";
import { RetryButton } from "./RetryButton";

it("повтор, начатый по одному сбою, не занимает кнопку, когда на её месте уже другой сбой — например, после смены проекта", async () => {
  const user = userEvent.setup();
  const hangingRetry = () => new Promise<never>(() => undefined);
  const { rerender } = render(<RetryButton failure={new Error("проект A")} onRetry={hangingRetry} />, { wrapper: TestMessagesProvider });

  await user.click(screen.getByRole("button", { name: "Повторить" }));
  expect(screen.getByRole("button", { name: "Повторяем…" })).toBeDefined();
  rerender(<RetryButton failure={new Error("проект B")} onRetry={hangingRetry} />);

  expect(screen.getByRole("button", { name: "Повторить" }).getAttribute("aria-disabled")).toBeNull();
});
