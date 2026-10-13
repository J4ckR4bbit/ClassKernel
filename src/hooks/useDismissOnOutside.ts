import { RefObject, useEffect, useRef } from "react";

/**
 * Close a pop-up when the teacher taps or clicks anywhere outside it. It
 * listens on pointerdown, so a tap on another seat closes this pop-up and the
 * same tap then opens that student's.
 */
export function useDismissOnOutside(ref: RefObject<HTMLElement | null>, open: boolean, onDismiss: () => void) {
  // The latest callback, so the listener needn't be re-added on every render.
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) dismiss.current();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open, ref]);
}
