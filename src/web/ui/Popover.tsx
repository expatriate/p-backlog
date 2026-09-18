import { useEffect, useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { Button } from "./Button";
import styles from "./Popover.module.css";

export type PopoverProps = {
  trigger: ReactNode;
  triggerProps?: Pick<ComponentProps<"button">, "aria-label" | "title" | "className">;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  children: (closePopover: () => void) => ReactNode;
};

export function Popover({ trigger, triggerProps, triggerRef, children }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const ownTrigger = useRef<HTMLButtonElement>(null);
  const button = triggerRef ?? ownTrigger;

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: Event) => {
      if (event.target instanceof Node && anchor.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  const closePopover = () => {
    setOpen(false);
    button.current?.focus();
  };
  const closeOnEscape = (event: KeyboardEvent) => {
    if (!open || event.key !== "Escape") return;
    event.stopPropagation();
    closePopover();
  };

  return (
    <div ref={anchor} className={styles.anchor} onKeyDown={closeOnEscape}>
      <Button {...triggerProps} ref={button} aria-expanded={open} onClick={() => setOpen(!open)}>
        {trigger}
      </Button>
      {/* eslint-disable-next-line react-hooks/refs -- closePopover only reads the ref inside later event handlers, never synchronously during this render */}
      {open && <div className={styles.panel}>{children(closePopover)}</div>}
    </div>
  );
}
