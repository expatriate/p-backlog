import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useDraft } from "./use-draft";

function Field({ serverValue }: { serverValue: string }) {
  const [draft, ref] = useDraft(serverValue);
  return <input ref={ref} aria-label="поле" value={draft.value} onChange={(event) => draft.set(event.target.value)} />;
}

describe("useDraft", () => {
  it("подхватывает новое значение с сервера, пока поле не в фокусе", async () => {
    const { rerender } = render(<Field serverValue="Первое" />);
    const field = screen.getByRole("textbox", { name: "поле" });
    expect(field).toHaveProperty("value", "Первое");

    rerender(<Field serverValue="Второе" />);

    expect(field).toHaveProperty("value", "Второе");
  });

  it("не затирает то, что пользователь печатает прямо сейчас", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Field serverValue="Первое" />);
    const field = screen.getByRole("textbox", { name: "поле" });

    await user.clear(field);
    await user.type(field, "Черновик");
    rerender(<Field serverValue="Второе" />);

    expect(field).toHaveProperty("value", "Черновик");
  });
});
