import { useEffect, useRef, useState, type RefObject } from "react";

export type Draft = [value: string, set: (next: string) => void, ref: RefObject<HTMLInputElement | null>];

export function useDraft(serverValue: string): Draft {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(serverValue);

  useEffect(() => {
    if (document.activeElement !== ref.current) setValue(serverValue);
  }, [serverValue]);

  return [value, setValue, ref];
}
