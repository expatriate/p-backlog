import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import styles from "./SidePanel.module.css";

export type SidePanelProps = {
  label: string;
  heading: ReactNode;
  onClose: () => void;
  canClose?: () => boolean;
  children: ReactNode;
};

const FORM_FIELDS = "input, textarea, select";

export function SidePanel({ label, heading, onClose, canClose, children }: SidePanelProps) {
  const panel = useRef<HTMLElement>(null);
  const requestClose = useRef(onClose);

  useEffect(() => {
    requestClose.current = () => {
      if (canClose?.() === false) return;
      onClose();
    };
  });

  useLayoutEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const drawer = panel.current;
    drawer?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.target instanceof HTMLElement && event.target.closest(FORM_FIELDS)) {
        event.target.blur();
        return;
      }
      requestClose.current();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      if (drawer?.contains(document.activeElement)) opener?.focus();
    };
  }, []);

  return (
    <aside ref={panel} className={styles.drawer} aria-label={label} tabIndex={-1}>
      <header className={styles.header}>
        {heading}
        <button type="button" className={styles.close} aria-label="Закрыть" onClick={() => requestClose.current()}>
          ×
        </button>
      </header>
      {children}
    </aside>
  );
}
