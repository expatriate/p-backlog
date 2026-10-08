import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FormEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

describe("недоступная кнопка", () => {
  it("кнопка отправки не отправляет форму ни нажатием, ни Enter в поле", async () => {
    const user = userEvent.setup();
    const submit = vi.fn((event: FormEvent) => event.preventDefault());
    render(
      <form onSubmit={submit}>
        <input aria-label="поле" />
        <Button type="submit" unavailable>
          Отправить
        </Button>
      </form>,
    );

    await user.click(screen.getByRole("button", { name: "Отправить" }));
    await user.type(screen.getByRole("textbox", { name: "поле" }), "x{Enter}");

    expect(submit).not.toHaveBeenCalled();
  });
});
