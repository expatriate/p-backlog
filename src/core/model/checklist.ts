export type ChecklistItem = { line: number; checked: boolean; text: string };

const ITEM = /^\s*[-*+]\s+\[(?<mark>[ xX])\]\s+(?<text>.*)$/;
const FENCE = /^\s{0,3}(?<fence>`{3,}|~{3,})/;

export function checklistItems(body: string): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  let openFence: string | null = null;
  for (const [line, content] of body.split("\n").entries()) {
    const fence = FENCE.exec(content)?.groups?.fence;
    if (fence !== undefined) {
      if (openFence === null) openFence = fence;
      else if (fence.startsWith(openFence)) openFence = null;
      continue;
    }
    if (openFence !== null) continue;
    const groups = ITEM.exec(content)?.groups;
    if (groups) items.push({ line, checked: groups.mark !== " ", text: groups.text ?? "" });
  }
  return items;
}

export function toggleChecklistItem(body: string, line: number): string {
  const item = checklistItems(body).find((candidate) => candidate.line === line);
  if (!item) return body;
  const lines = body.split("\n");
  lines[line] = (lines[line] ?? "").replace(/\[[ xX]\]/, item.checked ? "[ ]" : "[x]");
  return lines.join("\n");
}
