import { useEffect, useRef, useState } from "react";
import { useApp } from "../store/appStore";
import { pluginById } from "../plugins/registry";
import Icon from "./Icon";
import NewClassModal from "./NewClassModal";
import { DESTINATIONS, SETTINGS_DESTINATION } from "./NavRail";

// The bar across the top of every page: where you are on the left, and which
// class you are working with on the right. Choosing the class here, once,
// replaces the class list the old sidebar carried and the "Editing class"
// pickers inside Settings.

function pageTitle(view: string, activePlugin: string | null): string {
  if (view === "home") return "ClassKernel";
  if (view === "plugin") return (activePlugin && pluginById(activePlugin)?.name) || "Tool";
  if (view === "roster") return "Students";
  if (view === "layout") return "Room layout";
  const d = [...DESTINATIONS, SETTINGS_DESTINATION].find((x) => x.views.includes(view as never));
  return d?.name ?? "";
}

/** The current class, as a menu button listing every class and "New class". */
function ClassPicker() {
  const { classes, currentClass, openClass, createClass } = useApp();
  const [open, setOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = classes.filter((c) => !c.archived);
  const archived = classes.filter((c) => c.archived);
  const info = classes.find((c) => c.name === currentClass);

  // Close on a click elsewhere or Escape, like any menu.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
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

  const classRow = (name: string, detail: string) => (
    <button
      key={name}
      role="menuitemradio"
      aria-checked={name === currentClass}
      className={`menu-item ${name === currentClass ? "selected" : ""}`}
      onClick={() => pick(name)}
    >
      <span className="menu-check">{name === currentClass && <Icon name="check" size={20} />}</span>
      <span className="menu-text">
        {name}
        {detail && <small>{detail}</small>}
      </span>
    </button>
  );

  return (
    <div className="class-picker" ref={ref}>
      {classes.length === 0 ? (
        <button className="tonal" onClick={() => setShowNew(true)}>
          <Icon name="add" size={20} /> New class
        </button>
      ) : (
        <button
          className="class-picker-btn"
          onClick={() => setOpen(!open)}
          aria-haspopup="menu"
          aria-expanded={open}
          title="Change class"
        >
          <Icon name="group" size={20} />
          <span className="class-picker-name">{currentClass ?? "Pick a class"}</span>
          {info?.room && <span className="class-picker-room">{info.room}</span>}
          <Icon name="arrow_drop_down" size={24} />
        </button>
      )}

      {open && (
        <div className="menu" role="menu" aria-label="Classes">
          <div className="menu-label">Classes</div>
          {active.map((c) => classRow(c.name, [c.subject, c.room].filter(Boolean).join(" · ")))}
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
              {showArchived && archived.map((c) => classRow(c.name, "archived"))}
            </>
          )}
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
        </div>
      )}

      {showNew && <NewClassModal onClose={() => setShowNew(false)} onCreate={createClass} />}
    </div>
  );
}

export default function TopAppBar() {
  const { view, activePlugin, setView } = useApp();
  const back = view === "plugin" || view === "roster" || view === "layout";
  return (
    <header className="top-bar no-print">
      {back && (
        <button
          className="icon-btn"
          onClick={() => setView(view === "plugin" ? "home" : "settings")}
          aria-label={view === "plugin" ? "Back to Home" : "Back to Settings"}
          title={view === "plugin" ? "Back to Home" : "Back to Settings"}
        >
          <Icon name="arrow_back" />
        </button>
      )}
      <h1 className="top-bar-title">{pageTitle(view, activePlugin)}</h1>
      <div className="spacer" />
      <ClassPicker />
    </header>
  );
}
