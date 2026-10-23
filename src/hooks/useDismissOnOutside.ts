import { RefObject, useEffect, useRef } from "react";
import { inModal, modalOpen } from "../components/Modal";

/**
 * Close a pop-up when the teacher taps or clicks anywhere outside it, or
 * presses Escape. It listens on pointerdown, so a tap on another seat closes
 * this pop-up and the same tap then opens that student's. Escape is taken
 * first (capture phase, marked handled), so it closes the pop-up rather than
 * also leaving teaching mode. A dialog opened over the pop-up keeps both its
 * taps and its Escape.
 */
export function useDismissOnOutside(ref: RefObject<HTMLElement | null>, open: boolean, onDismiss: () => void) {
  // The latest callback, so the listener needn't be re-added on every render.
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !inModal(e.target)) dismiss.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || modalOpen()) return;
      e.preventDefault();
      dismiss.current();
    };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, ref]);
}
