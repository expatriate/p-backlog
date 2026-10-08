import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { useMessages } from "../i18n";
import { CloseIcon } from "./CloseIcon";
import { cx } from "./cx";
import { IconButton } from "./IconButton";
import styles from "./SidePanel.module.css";

export type SidePanelProps = { label: string; heading: ReactNode; onClose: () => void; className?: string | undefined; children: ReactNode };

const FORM_FIELDS = "input, textarea, select";
const MODAL_FLAG = "--drawer-modal";

export function SidePanel({ label, heading, onClose, className, children }: SidePanelProps) {
  const { ui } = useMessages();
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);

  useEffect(() => {
    close.current = onClose;
  });

  useLayoutEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const drawer = panel.current;
    let releaseBackground: (() => void) | null = null;
    const syncBackground = () => {
      const covers = drawer !== null && isModal(drawer);
      const backgroundInert = releaseBackground !== null;
      if (covers === backgroundInert) return;
      releaseBackground?.();
      releaseBackground = covers ? inertOutside(drawer) : null;
      if (covers && !drawer.contains(document.activeElement)) drawer.focus();
    };
    syncBackground();
    window.addEventListener("resize", syncBackground);
    drawer?.focus();
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (releaseBackground === null || (event.target instanceof Node && drawer?.contains(event.target))) return;
      close.current();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.target instanceof HTMLElement && event.target.closest(FORM_FIELDS)) {
        drawer?.focus();
        return;
      }
      close.current();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", syncBackground);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      releaseBackground?.();
      if (drawer?.contains(document.activeElement)) opener?.focus();
    };
  }, []);

  return (
    <aside ref={panel} className={cx(styles.drawer, className)} aria-label={label} tabIndex={-1}>
      <header className={styles.header}>
        {heading}
        <IconButton label={ui.close} onClick={() => close.current()}>
          <CloseIcon />
        </IconButton>
      </header>
      {children}
    </aside>
  );
}

function isModal(drawer: HTMLElement): boolean {
  return getComputedStyle(drawer).getPropertyValue(MODAL_FLAG).trim() === "1";
}

function inertOutside(element: HTMLElement): () => void {
  const madeInert: Element[] = [];
  for (let node = element; node.parentElement !== null && node !== document.body; node = node.parentElement) {
    for (const sibling of node.parentElement.children) {
      if (sibling === node || sibling.hasAttribute("inert")) continue;
      sibling.setAttribute("inert", "");
      madeInert.push(sibling);
    }
  }
  return () => madeInert.forEach((sibling) => sibling.removeAttribute("inert"));
}
