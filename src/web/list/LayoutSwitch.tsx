import { LIST_LAYOUTS, type ListLayout } from "../app/list-params";
import { useMessages } from "../i18n";
import { cx } from "../ui/cx";
import styles from "./LayoutSwitch.module.css";

export function LayoutSwitch({ layout, onChange }: { layout: ListLayout; onChange: (layout: ListLayout) => void }) {
  const { list } = useMessages();
  return (
    <div className={styles.switch} role="group" aria-label={list.viewSwitch}>
      {LIST_LAYOUTS.map((option) => {
        const current = option === layout;
        return (
          <button key={option} type="button" className={cx(styles.option, current && styles.current)} aria-pressed={current} onClick={current ? undefined : () => onChange(option)}>
            {option === "board" ? <BoardIcon /> : <ListIcon />}
            {option === "board" ? list.boardView : list.listView}
          </button>
        );
      })}
    </div>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
    </svg>
  );
}

function BoardIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="2.5" width="3.5" height="11" rx="1" />
      <rect x="6.25" y="2.5" width="3.5" height="7.5" rx="1" />
      <rect x="10.5" y="2.5" width="3.5" height="9.5" rx="1" />
    </svg>
  );
}
