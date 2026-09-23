import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
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
        cancelLabel="Отмена"
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

  it("Esc закрывает без действия", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Удалить проект «Торг»?"
        description="Задач: 27. Отменить нельзя."
        confirmWord="torg-io"
        confirmWordLabel="Введите id проекта: torg-io"
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    const dialog = document.querySelector("dialog");
    fireEvent(dialog as HTMLDialogElement, new Event("cancel", { cancelable: true }));

    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("после закрытия фокус возвращается на кнопку, открывшую диалог", async () => {
    const user = userEvent.setup();
    render(<DialogOpener />);

    await user.click(screen.getByRole("button", { name: "Удалить проект" }));
    await user.click(screen.getByRole("button", { name: "Отмена" }));

    expect(document.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Удалить проект" }));
  });
});

function DialogOpener() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Удалить проект
      </button>
      <ConfirmDialog
        open={open}
        title="Удалить проект «Торг»?"
        description="Задач: 27. Отменить нельзя."
        confirmWord="torg-io"
        confirmWordLabel="Введите id проекта: torg-io"
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        onConfirm={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
