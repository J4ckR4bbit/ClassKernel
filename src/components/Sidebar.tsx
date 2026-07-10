import { useState } from "react";
import { useApp, View } from "../store/appStore";
import { ClassInfo } from "../lib/types";

const NAV: Array<{ view: View; icon: string; label: string }> = [
  { view: "roster", icon: "👥", label: "Students" },
  { view: "attendance", icon: "✓", label: "Attendance" },
  { view: "layout", icon: "📐", label: "Room layout" },
  { view: "seating", icon: "🪑", label: "Seating plans" },
  { view: "lesson", icon: "🎓", label: "Live lesson" },
  { view: "behaviourLog", icon: "📋", label: "Behaviour log" },
  { view: "assessments", icon: "📝", label: "Assessments" },
  { view: "dashboard", icon: "📊", label: "Dashboard" },
  { view: "notes", icon: "🗒", label: "Class notes" },
  { view: "settings", icon: "⚙", label: "Settings" },
];

export default function Sidebar() {
  const { classes, currentClass, openClass, view, setView, dataDir, createClass, pickAndSetDataDir } = useApp();
  const [showNew, setShowNew] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const active = classes.filter((c) => !c.archived);
  const archived = classes.filter((c) => c.archived);

  return (
    <nav className="sidebar">
      <div className="brand">
        Organik Classroom
        <small>fast · offline · portable</small>
      </div>

      <div className="section-label">Classes</div>
      {active.map((c) => (
        <button
          key={c.name}
          className={`class-item ${c.name === currentClass ? "active" : ""}`}
          onClick={() => void openClass(c.name)}
        >
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

      <div className="footer">
        <button onClick={() => void pickAndSetDataDir()}>Change data folder</button>
        <div title={dataDir ?? ""}>{dataDir}</div>
      </div>

      {showNew && <NewClassModal onClose={() => setShowNew(false)} onCreate={createClass} />}
    </nav>
  );
}

function NewClassModal({ onClose, onCreate }: { onClose: () => void; onCreate: (info: ClassInfo) => Promise<void> }) {
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [subject, setSubject] = useState("");
  const [room, setRoom] = useState("");

  // Class name doubles as its folder name — keep it filesystem-safe.
  const safeName = name.replace(/[<>:"/\\|?*]/g, "").trim();

  const submit = async () => {
    if (!safeName) return;
    await onCreate({ name: safeName, year, subject, room, notes: "", archived: false });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New class</h2>
        <div className="form-grid">
          <label>Name</label>
          <input autoFocus placeholder="e.g. 7B-Science" value={name} onChange={(e) => setName(e.target.value)} />
          <label>Year</label>
          <input value={year} onChange={(e) => setYear(e.target.value)} />
          <label>Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          <label>Room</label>
          <input value={room} onChange={(e) => setRoom(e.target.value)} />
        </div>
        <div className="actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!safeName} onClick={() => void submit()}>
            Create class
          </button>
        </div>
      </div>
    </div>
  );
}
