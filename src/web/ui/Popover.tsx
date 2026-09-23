import {
  createContext,
  useContext,
  useId,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from "react";
import { Button } from "./Button";
import { cx } from "./cx";
import styles from "./Popover.module.css";

export type PopoverProps = {
  trigger: ReactNode;
  triggerProps?: Pick<ComponentProps<"button">, "aria-label" | "title" | "className">;
  triggerRef?: RefObject<HTMLButtonElement | null>;
  panelClassName?: string | undefined;
  children: ReactNode;
};

const INITIAL_FOCUS_ATTRIBUTE = "data-popover-focus";

export const POPOVER_INITIAL_FOCUS = { [INITIAL_FOCUS_ATTRIBUTE]: "" } as const;

const ClosePopoverContext = createContext<(() => void) | null>(null);

export function useClosePopover(): () => void {
  const closePopover = useContext(ClosePopoverContext);
  if (closePopover === null) throw new Error("useClosePopover вызван вне Popover");
  return closePopover;
}

export function Popover({ trigger, triggerProps, triggerRef, panelClassName, children }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const triggerId = useId();
  const panelId = useId();
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
    menu.scrollIntoView({ block: "nearest" });
    menu.querySelector<HTMLElement>(`[${INITIAL_FOCUS_ATTRIBUTE}]`)?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: Event) => {
      if (event.target instanceof Node && anchor.current?.contains(event.target)) return;
      setOpen(false);
    };
    const closeOnFocusOutside = (event: FocusEvent) => {
      if (!(event.target instanceof Node) || !anchor.current) return;
      if (anchor.current.contains(event.target) || event.target.contains(anchor.current)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("focusin", closeOnFocusOutside);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("focusin", closeOnFocusOutside);
    };
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
      <Button
        {...triggerProps}
        id={triggerId}
        ref={button}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen(!open)}
      >
        {trigger}
      </Button>
      {open && (
        <div ref={panel} id={panelId} role="group" aria-labelledby={triggerId} className={cx(styles.panel, panelClassName)}>
          <ClosePopoverContext value={closePopover}>{children}</ClosePopoverContext>
        </div>
      )}
    </div>
  );
}
