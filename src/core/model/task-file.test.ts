import { describe, expect, it } from "vitest";
import { parseTaskFile, serializeTask } from "./task-file";

const location = { projectId: "spa", path: "/backlog/spa/SPA-12.md", version: "v1" };

const FILE = `---
id: SPA-12
title: "Таймауты: большие файлы"
type: task
status: in-progress
priority: high
tags: [Upload, network, upload]
epic: SPA-3
blockedBy: [SPA-10, TI-4]
related: [SPA-15]
created: 2026-09-17T17:50:00+03:00
source: src/upload/client.ts:88
owner: dmitry
links:
  jira: SPA-9000
---

Описание.

## Чеклист
- [ ] Вынести таймаут
- [x] Воспроизвести
`;

describe("parseTaskFile", () => {
  it("разбирает поля, нормализует теги и сохраняет неизвестные поля", () => {
    const result = parseTaskFile(FILE, location);
    expect(result).toMatchObject({
      ok: true,
      value: {
        id: "SPA-12",
        title: "Таймауты: большие файлы",
        status: "in-progress",
        tags: ["upload", "network"],
        epic: "SPA-3",
        blockedBy: ["SPA-10", "TI-4"],
        extra: { owner: "dmitry", links: { jira: "SPA-9000" } },
        body: "Описание.\n\n## Чеклист\n- [ ] Вынести таймаут\n- [x] Воспроизвести\n",
        projectId: "spa",
        path: "/backlog/spa/SPA-12.md",
        version: "v1",
      },
    });
  });

  it("подставляет значения по умолчанию", () => {
    const result = parseTaskFile("---\nid: SPA-1\ntitle: X\ncreated: 2026-09-17T10:00:00Z\n---\n", location);
    expect(result).toMatchObject({
      ok: true,
      value: { type: "task", status: "backlog", priority: "medium", tags: [], blockedBy: [], related: [], body: "" },
    });
  });

  it.each([
    ["без frontmatter", "Просто текст"],
    ["незакрытый frontmatter", "---\nid: SPA-1\n"],
    ["битый YAML", "---\nid: [SPA-1\n---\n"],
    ["неизвестный статус", "---\nid: SPA-1\ntitle: X\nstatus: later\ncreated: 2026-09-17T10:00:00Z\n---\n"],
    ["дата без пояса", "---\nid: SPA-1\ntitle: X\ncreated: 2026-09-17\n---\n"],
  ])("возвращает ошибку: %s", (_, text) => {
    expect(parseTaskFile(text, location).ok).toBe(false);
  });

  it("называет поле в тексте ошибки", () => {
    const result = parseTaskFile("---\nid: SPA-1\ntitle: X\nstatus: later\ncreated: 2026-09-17T10:00:00Z\n---\n", location);
    expect(result.ok ? "" : result.message).toContain("status");
  });
});

describe("serializeTask", () => {
  it("пишет известные поля по порядку, затем неизвестные, и читается обратно без потерь", () => {
    const parsed = parseTaskFile(FILE, location);
    if (!parsed.ok) throw new Error(parsed.message);
    const text = serializeTask(parsed.value);
    expect(text).toBe(`---
id: SPA-12
title: "Таймауты: большие файлы"
type: task
status: in-progress
priority: high
tags: [upload, network]
epic: SPA-3
blockedBy: [SPA-10, TI-4]
related: [SPA-15]
created: 2026-09-17T17:50:00+03:00
source: src/upload/client.ts:88
owner: dmitry
links:
  jira: SPA-9000
---

Описание.

## Чеклист
- [ ] Вынести таймаут
- [x] Воспроизвести
`);
    const reparsed = parseTaskFile(text, location);
    expect(reparsed).toEqual(parsed);
  });

  it("не пишет пустое тело и отсутствующие необязательные поля", () => {
    const parsed = parseTaskFile("---\nid: SPA-1\ntitle: X\ncreated: 2026-09-17T10:00:00Z\n---\n", location);
    if (!parsed.ok) throw new Error(parsed.message);
    expect(serializeTask(parsed.value)).toBe(
      "---\nid: SPA-1\ntitle: X\ntype: task\nstatus: backlog\npriority: medium\ntags: []\nblockedBy: []\nrelated: []\ncreated: 2026-09-17T10:00:00Z\n---\n",
    );
  });
});
