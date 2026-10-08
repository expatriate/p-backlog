import { tagLabel } from "../labels";
import { Chip, ToggleChip } from "./Chip";

export function TagChip({ tag, pressed, onToggle }: { tag: string; pressed: boolean; onToggle: () => void }) {
  return (
    <ToggleChip pressed={pressed} onToggle={onToggle}>
      {tagLabel(tag)}
    </ToggleChip>
  );
}

export function StaticTagChip({ tag }: { tag: string }) {
  return <Chip>{tagLabel(tag)}</Chip>;
}
