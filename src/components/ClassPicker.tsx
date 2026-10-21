import { useEffect, useRef, useState } from "react";
import { useAppPick } from "../store/appStore";
import Icon from "./Icon";
import NewClassModal from "./NewClassModal";

// The one way to choose the class you are working with: a Material menu
// button listing every class (with its colour) and "New class". It lives in
// the top app bar; the parent-report preview, which covers the bar, shows the
// same menu in its options panel.

/** The class's colour as a small dot; a hollow ring keeps names lined up when it has none. */
function ClassDot({ color }: { color: string }) {
  return <span className={`class-dot ${color ? "" : "none"}`} style={color ? { background: color } : undefined} aria-hidden />;
}

export default function ClassPicker({
  inPanel = false,
}: {
  /**
   * Shown in a side panel rather than the top bar: the button fills the
   * panel's width, the menu opens in place below it, and "New class" is left
   * out (its dialog would open behind the full-screen preview).
   */
  inPanel?: boolean;
}) {
  const { classes, currentClass, openClass, createClass } = useAppPick(
    "classes",
    "currentClass",
    "openClass",
    "createClass",
  );
  const [open, setOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = classes.filter((c) => !c.archived);
  const archived = classes.filter((c) => c.archived);
  const info = classes.find((c) => c.name === currentClass);

  // Close on a click elsewhere or Escape, like any menu. Escape stops here so
  // it doesn't also close the report preview the menu sits in.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (name: string) => {
    setOpen(false);
    void openClass(name);
  };

  const classRow = (name: string, color: string, detail: string) => (
    <button
      key={name}
      role="menuitemradio"
      aria-checked={name === currentClass}
      className={`menu-item ${name === currentClass ? "selected" : ""}`}
      onClick={() => pick(name)}
    >
      <span className="menu-check">{name === currentClass && <Icon name="check" size={20} />}</span>
      <span className="menu-text">
        <span>
          <ClassDot color={color} />
          {name}
        </span>
        {detail && <small>{detail}</small>}
      </span>
    </button>
  );

  return (
    <div className={`class-picker ${inPanel ? "in-panel" : ""}`} ref={ref}>
      {classes.length === 0 ? (
        inPanel ? null : (
          <button className="tonal" onClick={() => setShowNew(true)}>
            <Icon name="add" size={20} /> New class
          </button>
        )
      ) : (
        <button
          className="class-picker-btn"
          onClick={() => setOpen(!open)}
          aria-haspopup="menu"
          aria-expanded={open}
          title="Change class"
        >
          {info?.color ? <ClassDot color={info.color} /> : <Icon name="group" size={20} />}
          <span className="class-picker-name">{currentClass ?? "Pick a class"}</span>
          {info?.room && <span className="class-picker-room">{info.room}</span>}
          <Icon name="arrow_drop_down" size={24} />
        </button>
      )}

      {open && (
        <div className="menu" role="menu" aria-label="Classes">
          <div className="menu-label">Classes</div>
          {active.map((c) => classRow(c.name, c.color, [c.subject, c.room].filter(Boolean).join(" · ")))}
          {archived.length > 0 && (
            <>
              <div className="menu-divider" />
              <button className="menu-item" onClick={() => setShowArchived(!showArchived)} aria-expanded={showArchived}>
                <span className="menu-check">
                  <Icon name="archive" size={20} />
                </span>
                <span className="menu-text">Archived ({archived.length})</span>
                <Icon name={showArchived ? "arrow_drop_down" : "chevron_right"} size={20} />
              </button>
              {showArchived && archived.map((c) => classRow(c.name, c.color, "archived"))}
            </>
          )}
          {!inPanel && (
            <>
              <div className="menu-divider" />
              <button
                className="menu-item"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setShowNew(true);
                }}
              >
                <span className="menu-check">
                  <Icon name="add" size={20} />
                </span>
                <span className="menu-text">New class</span>
              </button>
            </>
          )}
        </div>
      )}

      {showNew && <NewClassModal onClose={() => setShowNew(false)} onCreate={createClass} />}
    </div>
  );
}
