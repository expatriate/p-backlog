import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

describe("подтверждение действия", () => {
  it("кнопка включается только при точном совпадении", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Удалить проект «Торг»?"
        description="Задач: 27. Отменить нельзя."
        confirmWord="torg-io"
        confirmWordLabel="Введите id проекта: torg-io"
        confirmLabel="Удалить"
        onConfirm={onConfirm}
        onCancel={() => undefined}
      />,
    );

    const confirm = screen.getByRole("button", { name: "Удалить" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    await user.type(screen.getByRole("textbox"), "torg-i");
    expect(confirm.disabled).toBe(true);

    await user.type(screen.getByRole("textbox"), "o");
    await user.click(confirm);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
