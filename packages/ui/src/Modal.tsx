import { ReactNode, useEffect, useId, useRef, useState } from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** Whether a dialog is open: pop-ups and teaching-mode shortcuts leave keys to it. */
export function modalOpen(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null;
}

/** Whether a tap landed inside an open dialog. */
export function inModal(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[aria-modal="true"]') !== null;
}

/**
 * The shell every dialog shares: a dimmed backdrop (a click on it closes),
 * Escape to close, focus moved inside on opening and handed back on closing,
 * and Tab kept within the dialog, so nobody using a keyboard or a screen
 * reader wanders into the page behind it.
 */
export default function Modal({
  title,
  onClose,
  className,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  // The latest callback, so the listener needn't be re-added on every render.
  const close = useRef(onClose);
  close.current = onClose;
  // A drag that starts in a field and ends on the backdrop isn't a click on it.
  const downOnBackdrop = useRef(false);
  // Noted while rendering: by the time effects run, an autoFocus field has focus.
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));

  useEffect(() => {
    const el = box.current;
    // React has already focused an autoFocus field; otherwise the first control.
    if (el && !el.contains(document.activeElement)) (el.querySelector<HTMLElement>(FOCUSABLE) ?? el).focus();

    const onKey = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[aria-modal="true"]');
      if (!el || dialogs[dialogs.length - 1] !== el) return; // only the top dialog answers
      if (e.key === "Escape") {
        if (e.defaultPrevented) return;
        e.preventDefault();
        close.current();
      } else if (e.key === "Tab") {
        const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
        if (items.length === 0) return e.preventDefault();
        const first = items[0];
        const last = items[items.length - 1];
        const at = document.activeElement;
        if (e.shiftKey && (at === first || !el.contains(at))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (at === last || !el.contains(at))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    // Capture phase, so Escape closes this before a pop-up or teaching mode sees it.
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      // Back to the button that opened it, unless focus has already moved on
      // (to the next dialog, say).
      const at = document.activeElement;
      if (opener?.isConnected && (!at || at === document.body || el?.contains(at))) opener.focus();
    };
  }, [opener]);

  return (
    <div
      className="modal-backdrop"
      onPointerDown={(e) => (downOnBackdrop.current = e.target === e.currentTarget)}
      onClick={(e) => {
        if (e.target === e.currentTarget && downOnBackdrop.current) close.current();
      }}
    >
      <div
        ref={box}
        className={className ? `modal ${className}` : "modal"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
