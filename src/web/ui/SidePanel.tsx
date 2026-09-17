import { useEffect, useRef, type ReactNode } from "react";
import styles from "./SidePanel.module.css";

export type SidePanelProps = { label: string; heading: ReactNode; onClose: () => void; children: ReactNode };

export function SidePanel({ label, heading, onClose, children }: SidePanelProps) {
  const panel = useRef<HTMLElement>(null);

  useEffect(() => {
    panel.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <aside ref={panel} className={styles.drawer} aria-label={label} tabIndex={-1}>
      <header className={styles.header}>
        {heading}
        <button type="button" className={styles.close} aria-label="Закрыть" onClick={onClose}>
          ×
        </button>
      </header>
      {children}
    </aside>
  );
}
