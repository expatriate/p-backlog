import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { TestMessagesProvider } from "../testing/messages-provider";
import type { EpicChoices } from "./epic-choices";
import { DEFAULT_SORT, type ListParams } from "./list-params";
import { Toolbar } from "./Toolbar";

const NO_EPICS: EpicChoices = { epics: [], withoutEpicCount: 0 };

function ToolbarHarness({ initial, tags = [], epicChoices = NO_EPICS }: { initial: ListParams["filter"]; tags?: string[]; epicChoices?: EpicChoices }) {
  const [params, setParams] = useState<ListParams>({ filter: initial, sort: DEFAULT_SORT });
  return (
    <TestMessagesProvider>
      <Toolbar params={params} onChange={setParams} tags={tags} epicChoices={epicChoices} autoClosedCount={0} />
    </TestMessagesProvider>
  );
}

function statusChip(name: string): HTMLElement {
  return within(screen.getByRole("group", { name: "Статус" })).getByRole("button", { name });
}

describe("тулбар фильтров", () => {
  it("последний выбранный статус не снимается: пустой фильтр статусов не показывал бы ни одной задачи", async () => {
    const user = userEvent.setup();
    render(<ToolbarHarness initial={{ statuses: ["backlog", "in-progress"] }} />);

    await user.click(statusChip("в работе"));
    await user.click(statusChip("в беклоге"));

    expect(statusChip("в беклоге").getAttribute("aria-pressed")).toBe("true");
    expect(statusChip("в беклоге").getAttribute("aria-disabled")).toBe("true");
    expect(statusChip("в работе").getAttribute("aria-disabled")).toBeNull();
  });

  it("фильтр по эпику виден и снимается, даже когда в проекте нет эпиков", async () => {
    const user = userEvent.setup();
    render(<ToolbarHarness initial={{ statuses: ["backlog"], epic: "OF-1" }} />);

    expect(screen.getByRole("button", { name: "Эпик: OF-1" })).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Сбросить эпик" }));

    expect(screen.queryByRole("button", { name: /^Эпик:/ })).toBeNull();
  });

  it("чужой эпик из адреса отмечен в меню отдельным пунктом, фокус открытого меню на нём", async () => {
    const user = userEvent.setup();
    const epicChoices: EpicChoices = { epics: [{ id: "SPA-1", title: "Эпик загрузки", tone: 1, taskCount: 2 }], withoutEpicCount: 0 };
    render(<ToolbarHarness initial={{ statuses: ["backlog"], epic: "OF-1" }} epicChoices={epicChoices} />);

    await user.click(screen.getByRole("button", { name: "Эпик: OF-1" }));

    const foreign = within(screen.getByRole("group", { name: "Эпики" })).getByRole("button", { name: /OF-1/ });
    expect(foreign.getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(foreign);
    expect(screen.getByRole("button", { name: /SPA-1/ }).getAttribute("aria-pressed")).toBe("false");
  });

  it("снятый чужой эпик не роняет фокус: он переходит на соседнюю кнопку «Теги», а без тегов — в поиск", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ToolbarHarness initial={{ statuses: ["backlog"], epic: "OF-1" }} tags={["ui"]} />);

    screen.getByRole("button", { name: "Сбросить эпик" }).focus();
    await user.keyboard("{Enter}");

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Теги (1)" }));
    unmount();

    render(<ToolbarHarness initial={{ statuses: ["backlog"], epic: "OF-1" }} />);
    await user.click(screen.getByRole("button", { name: "Эпик: OF-1" }));
    await user.click(screen.getByRole("button", { name: "Любой эпик" }));

    expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: "Поиск задач" }));
  });
});
