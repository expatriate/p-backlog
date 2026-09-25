import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTaskSelection } from "./use-task-selection";

const IDS = ["SPA-1", "SPA-2", "SPA-3", "SPA-4", "SPA-5"];

function renderSelection(visibleIds: readonly string[] = IDS, scopeKey = "spa") {
  return renderHook(({ ids, scope }) => useTaskSelection(ids, scope), { initialProps: { ids: visibleIds, scope: scopeKey } });
}

describe("useTaskSelection", () => {
  it("галочка ставится и снимается повторным нажатием", () => {
    const { result } = renderSelection();

    act(() => result.current.toggle("SPA-2"));
    act(() => result.current.toggle("SPA-4"));
    act(() => result.current.toggle("SPA-2"));

    expect([...result.current.selected]).toEqual(["SPA-4"]);
  });

  it("диапазон идёт от последней отмеченной до нажатой в порядке списка, в обе стороны", () => {
    const { result } = renderHook(() => useTaskSelection(["SPA-5", "SPA-1", "SPA-4", "SPA-2", "SPA-3"], "spa"));

    act(() => result.current.toggle("SPA-1"));
    act(() => result.current.toggle("SPA-2", { range: true }));
    expect([...result.current.selected].sort()).toEqual(["SPA-1", "SPA-2", "SPA-4"]);

    act(() => result.current.toggle("SPA-5", { range: true }));
    expect([...result.current.selected].sort()).toEqual(["SPA-1", "SPA-2", "SPA-4", "SPA-5"]);
  });

  it("диапазон от снятой галочки снимает галочки диапазона", () => {
    const { result } = renderSelection();
    act(() => result.current.setAllVisible(true));

    act(() => result.current.toggle("SPA-2"));
    act(() => result.current.toggle("SPA-4", { range: true }));

    expect([...result.current.selected]).toEqual(["SPA-1", "SPA-5"]);
  });

  it("«все видимые» с промежуточным состоянием при частичном выборе", () => {
    const { result } = renderSelection();
    expect(result.current.allVisibleState).toBe("none");

    act(() => result.current.toggle("SPA-3"));
    expect(result.current.allVisibleState).toBe("some");

    act(() => result.current.setAllVisible(true));
    expect(result.current.allVisibleState).toBe("all");
    expect(result.current.selected.size).toBe(5);

    act(() => result.current.setAllVisible(false));
    expect(result.current.allVisibleState).toBe("none");
    expect(result.current.selected.size).toBe(0);
  });

  it("смена фильтра выбор не сбрасывает: скрытые считаются, «снять все видимые» их не трогает", () => {
    const { result, rerender } = renderSelection();
    act(() => result.current.toggle("SPA-1"));
    act(() => result.current.toggle("SPA-4"));

    rerender({ ids: ["SPA-2", "SPA-3", "SPA-4"], scope: "spa" });

    expect(result.current.hiddenCount).toBe(1);
    expect(result.current.allVisibleState).toBe("some");
    act(() => result.current.setAllVisible(false));
    expect([...result.current.selected]).toEqual(["SPA-1"]);
    expect(result.current.hiddenCount).toBe(1);
  });

  it("смена проекта в адресе сбрасывает выбор", () => {
    const { result, rerender } = renderSelection();
    act(() => result.current.toggle("SPA-1"));

    rerender({ ids: IDS, scope: "" });
    expect(result.current.selected.size).toBe(0);

    act(() => result.current.toggle("SPA-3", { range: true }));
    expect([...result.current.selected]).toEqual(["SPA-3"]);
  });

  it("clear снимает всё, включая скрытые фильтром", () => {
    const { result, rerender } = renderSelection();
    act(() => result.current.toggle("SPA-1"));
    rerender({ ids: ["SPA-2"], scope: "spa" });

    act(() => result.current.clear());

    expect(result.current.selected.size).toBe(0);
    expect(result.current.hiddenCount).toBe(0);
  });
});
