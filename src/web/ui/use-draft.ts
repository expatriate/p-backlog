import { useEffect, useRef, useState, type RefObject } from "react";

export type Draft<E extends HTMLElement> = [value: string, set: (next: string) => void, ref: RefObject<E | null>];

export function useDraft<E extends HTMLElement = HTMLInputElement>(serverValue: string): Draft<E> {
  const ref = useRef<E>(null);
  const [value, setValue] = useState(serverValue);

  useEffect(() => {
    if (document.activeElement !== ref.current) setValue(serverValue);
  }, [serverValue]);

  return [value, setValue, ref];
}
