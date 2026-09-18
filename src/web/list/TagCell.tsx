import { useLayoutEffect, useRef, useState } from "react";
import { Chip } from "../ui/Chip";
import { fittingTagCount } from "./fit-tags";
import styles from "./TagCell.module.css";

export function TagCell({ tags }: { tags: readonly string[] }) {
  const cell = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(tags.length);

  useLayoutEffect(() => {
    const box = cell.current;
    const measured = ruler.current;
    if (!box || !measured) return;
    const fit = () => {
      const widths = [...measured.children].map((chip) => chip.getBoundingClientRect().width);
      const moreWidth = widths.pop() ?? 0;
      const gap = Number.parseFloat(getComputedStyle(measured).columnGap) || 0;
      setVisibleCount(fittingTagCount({ tagWidths: widths, moreWidth, gap, available: box.clientWidth }));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [tags]);

  const hiddenCount = tags.length - visibleCount;

  return (
    <div ref={cell} className={styles.cell}>
      {tags.slice(0, visibleCount).map((tag) => (
        <Chip key={tag}>#{tag}</Chip>
      ))}
      {hiddenCount > 0 && <Chip title={tags.join(", ")}>+{hiddenCount}</Chip>}
      <div ref={ruler} className={styles.ruler} aria-hidden="true">
        {tags.map((tag) => (
          <Chip key={tag}>#{tag}</Chip>
        ))}
        <Chip>+{tags.length}</Chip>
      </div>
    </div>
  );
}
