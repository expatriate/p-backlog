import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from "react";
import { Button } from "./Button";
import styles from "./Popover.module.css";

export type PopoverProps = {
  trigger: ReactNode;
  triggerProps?: Pick<ComponentProps<"button">, "aria-label" | "title" | "className">;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
};

export const POPOVER_INITIAL_FOCUS = { "data-popover-focus": "" } as const;

const ClosePopoverContext = createContext<(() => void) | null>(null);

export function useClosePopover(): () => void {
  const closePopover = useContext(ClosePopoverContext);
  if (closePopover === null) throw new Error("useClosePopover вызван вне Popover");
  return closePopover;
}

export function Popover({ trigger, triggerProps, triggerRef, children }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const ownTrigger = useRef<HTMLButtonElement>(null);
  const button = triggerRef ?? ownTrigger;

  const closePopover = () => {
    setOpen(false);
    button.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open) return;
    const menu = panel.current;
    if (!menu) return;
    const sideMargin = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--space-4"));
    const overflow = menu.getBoundingClientRect().right - (document.documentElement.clientWidth - sideMargin);
    menu.style.transform = overflow > 0 ? `translateX(-${overflow}px)` : "";
    menu.querySelector<HTMLElement>("[data-popover-focus]")?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: Event) => {
      if (event.target instanceof Node && anchor.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("keydown", closeOnEscape, true);
    return () => document.removeEventListener("keydown", closeOnEscape, true);
  }, [open, button]);

  return (
    <div ref={anchor} className={styles.anchor}>
      <Button {...triggerProps} ref={button} aria-expanded={open} onClick={() => setOpen(!open)}>
        {trigger}
      </Button>
      {open && (
        <div ref={panel} className={styles.panel}>
          <ClosePopoverContext value={closePopover}>{children}</ClosePopoverContext>
        </div>
      )}
    </div>
  );
}
