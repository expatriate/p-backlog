import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { useDraft } from "./use-draft";

function Field({ serverValue }: { serverValue: string }) {
  const { ref, value, set } = useDraft(serverValue);
  return <input ref={ref} aria-label="поле" value={value} onChange={(event) => set(event.target.value)} />;
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

  it("после двух упавших сохранений подряд повтор отправляет последний текст, а не выдаёт ложный конфликт", async () => {
    const answers: ((saved: boolean) => void)[] = [];
    const sent: string[] = [];
    const save = (text: string) => {
      sent.push(text);
      return new Promise<boolean>((resolve) => answers.push(resolve));
    };
    const { result } = renderHook(() => useDraft("исходное"));

    act(() => result.current.set("x"));
    act(() => result.current.commit(save));
    act(() => result.current.set("y"));
    act(() => result.current.commit(save));
    await act(async () => answers.forEach((answer) => answer(false)));
    act(() => result.current.commit(save));

    expect(sent).toEqual(["x", "y", "y"]);
    expect(result.current.conflicted).toBe(false);
  });
});
