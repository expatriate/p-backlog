import { useLayoutEffect, useRef, useState } from "react";
import { useMessages } from "../i18n";
import { Chip, ToggleChip } from "../ui/Chip";
import { fittingTagCount } from "./fit-tags";
import styles from "./TagCell.module.css";

export type TagCellProps = { tags: readonly string[]; selected: readonly string[]; onToggle: (tag: string) => void };

export function TagCell({ tags, selected, onToggle }: TagCellProps) {
  const { list } = useMessages();
  const cell = useRef<HTMLDivElement>(null);
  const tagRuler = useRef<HTMLSpanElement>(null);
  const moreRuler = useRef<HTMLSpanElement>(null);
  const [visibleCount, setVisibleCount] = useState(tags.length);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    const box = cell.current;
    const tagChips = tagRuler.current;
    const moreChip = moreRuler.current;
    if (!box || !tagChips || !moreChip) return;
    const fit = () => {
      const widths = [...tagChips.children].map((chip) => chip.getBoundingClientRect().width);
      const moreWidth = moreChip.getBoundingClientRect().width;
      const gap = Number.parseFloat(getComputedStyle(box).columnGap) || 0;
      setVisibleCount(fittingTagCount({ tagWidths: widths, moreWidth, gap, available: box.clientWidth }));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [tags]);

  if (tags.length === 0) return <div ref={cell} className={styles.cell} />;

  const shown = expanded ? tags : tags.slice(0, visibleCount);
  const hiddenCount = tags.length - visibleCount;

  return (
    <div ref={cell} className={styles.cell}>
      {shown.map((tag) => (
        <ToggleChip key={tag} pressed={selected.includes(tag)} onToggle={() => onToggle(tag)}>
          #{tag}
        </ToggleChip>
      ))}
      {expanded ? (
        <button type="button" className={styles.more} onClick={() => setExpanded(false)} aria-expanded={true}>
          {list.collapseTags}
        </button>
      ) : (
        hiddenCount > 0 && (
          <button type="button" className={styles.more} onClick={() => setExpanded(true)} aria-expanded={false} aria-label={list.showMoreTags(hiddenCount)} title={tags.join(", ")}>
            +{hiddenCount}
          </button>
        )
      )}
      <div className={styles.ruler} aria-hidden="true">
        <span ref={tagRuler} className={styles.rulerTags}>
          {tags.map((tag) => (
            <Chip key={tag}>#{tag}</Chip>
          ))}
        </span>
        <span ref={moreRuler}>
          <Chip>+{tags.length}</Chip>
        </span>
      </div>
    </div>
  );
}
