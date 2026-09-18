import { useLayoutEffect, useRef, useState } from "react";
import { Chip } from "../ui/Chip";
import { fittingTagCount } from "./fit-tags";
import styles from "./TagCell.module.css";

export function TagCell({ tags }: { tags: readonly string[] }) {
  const cell = useRef<HTMLDivElement>(null);
  const tagRuler = useRef<HTMLSpanElement>(null);
  const moreRuler = useRef<HTMLSpanElement>(null);
  const [visibleCount, setVisibleCount] = useState(tags.length);

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

  const hiddenCount = tags.length - visibleCount;

  return (
    <div ref={cell} className={styles.cell}>
      {tags.slice(0, visibleCount).map((tag) => (
        <Chip key={tag}>#{tag}</Chip>
      ))}
      {hiddenCount > 0 && <Chip title={tags.join(", ")}>+{hiddenCount}</Chip>}
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
