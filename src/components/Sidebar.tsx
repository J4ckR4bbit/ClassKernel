import { useState } from "react";
import { useApp, View } from "../store/appStore";
import NewClassModal from "./NewClassModal";

// Room layout and Students now live under Settings; the sidebar keeps the
// day-to-day teaching views plus Home as the landing page.
const NAV: Array<{ view: View; icon: string; label: string }> = [
  { view: "home", icon: "🏠", label: "Home" },
  { view: "attendance", icon: "✓", label: "Attendance" },
  { view: "seating", icon: "🪑", label: "Seating plans" },
  { view: "lesson", icon: "🎓", label: "Live lesson" },
  { view: "behaviourLog", icon: "📋", label: "Behaviour log" },
  { view: "assessments", icon: "📝", label: "Assessments" },
  { view: "notes", icon: "🗒", label: "Class notes" },
  { view: "settings", icon: "⚙", label: "Settings" },
];

export default function Sidebar({ onHide }: { onHide: () => void }) {
  const { classes, currentClass, openClass, view, setView, createClass } = useApp();
  const [showNew, setShowNew] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const active = classes.filter((c) => !c.archived);
  const archived = classes.filter((c) => c.archived);

  return (
    <nav className="sidebar">
      <div className="brand">
        <div>
          ClassKernel
          <small>fast · offline · portable</small>
        </div>
        <button className="sidebar-hide" onClick={onHide} title="Hide the menu" aria-label="Hide the menu">
          «
        </button>
      </div>

      <div className="section-label">Classes</div>
      {active.map((c) => (
        <button
          key={c.name}
          className={`class-item ${c.name === currentClass ? "active" : ""}`}
          onClick={() => void openClass(c.name)}
        >
          <ClassDot color={c.color} />
          {c.name}
          {c.room ? <span style={{ opacity: 0.6 }}> · {c.room}</span> : null}
        </button>
      ))}
      <button className="class-item" onClick={() => setShowNew(true)}>
        + New class
      </button>
      {archived.length > 0 && (
        <>
          <button className="class-item" style={{ opacity: 0.6 }} onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? "▾" : "▸"} Archived ({archived.length})
          </button>
          {showArchived &&
            archived.map((c) => (
              <button
                key={c.name}
                className={`class-item ${c.name === currentClass ? "active" : ""}`}
                style={{ opacity: 0.6, paddingLeft: 28 }}
                onClick={() => void openClass(c.name)}
              >
                <ClassDot color={c.color} />
                {c.name}
              </button>
            ))}
        </>
      )}

      <div className="section-label">Views</div>
      {NAV.map((n) => (
        <button
          key={n.view}
          className={`nav-item ${view === n.view ? "active" : ""}`}
          onClick={() => setView(n.view)}
        >
          <span className="icon">{n.icon}</span>
          {n.label}
        </button>
      ))}

      {showNew && <NewClassModal onClose={() => setShowNew(false)} onCreate={createClass} />}
    </nav>
  );
}

/** The class's colour as a small dot; a hollow ring keeps names lined up when it has none. */
function ClassDot({ color }: { color: string }) {
  return <span className={`class-dot ${color ? "" : "none"}`} style={color ? { background: color } : undefined} aria-hidden />;
}
