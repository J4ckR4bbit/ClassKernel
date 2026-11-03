import { ReactNode, useRef, useState } from "react";
import { useDismissOnOutside } from "../hooks/useDismissOnOutside";
import Icon, { IconName } from "./Icon";

/**
 * A small button that opens a panel under it, closed by a tap outside or
 * Escape (the room designer's Text size and Templates, the behaviour icon
 * picker). Children may be a function given `close`, for choices that should
 * shut the panel, or that open a dialog: focus goes back to the button, so the
 * dialog hands it back there too.
 */
export default function Popover({
  label,
  icon,
  count,
  title,
  ariaLabel,
  showArrow = true,
  buttonClassName = "small",
  panelClassName,
  children,
}: {
  /** What the button says (text, or an icon alone). */
  label: ReactNode;
  icon?: IconName;
  /** A small number beside the label (how many templates there are). */
  count?: number;
  title?: string;
  /** Needed when the label isn't text. */
  ariaLabel?: string;
  showArrow?: boolean;
  buttonClassName?: string;
  panelClassName?: string;
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useDismissOnOutside(box, open, () => {
    const inside = box.current?.contains(document.activeElement);
    setOpen(false);
    if (inside) toggle.current?.focus();
  });
  const close = () => {
    setOpen(false);
    toggle.current?.focus();
  };
  const name = ariaLabel ?? (typeof label === "string" ? label : undefined);
  return (
    <div className="popover-anchor" ref={box}>
      <button
        ref={toggle}
        className={`${buttonClassName} ${open ? "on" : ""}`}
        aria-expanded={open}
        aria-label={ariaLabel}
        title={title}
        onClick={() => setOpen(!open)}
      >
        {icon && <Icon name={icon} size={18} />} {label}
        {count ? <span className="popover-count">{count}</span> : null}
        {showArrow && <Icon name="arrow_drop_down" size={18} />}
      </button>
      {open && (
        <div className={panelClassName ? `popover-panel ${panelClassName}` : "popover-panel"} role="group" aria-label={name}>
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  );
}
