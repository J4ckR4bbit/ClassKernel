import { useState } from "react";
import { useApp } from "../store/appStore";
import { ClassInfo } from "../lib/types";
import NewClassModal from "./NewClassModal";

/**
 * Landing page: every class as a card with the two things a teacher reaches
 * for at the start of a lesson — reroll the seating, or jump into the live
 * lesson. Setup (students, room layout, seating rules) lives under Settings.
 */
export default function HomeView() {
  const { classes, openClass, setView, setPendingRandomise, createClass } = useApp();
  const [showNew, setShowNew] = useState(false);
  const active = classes.filter((c) => !c.archived);

  const meta = (c: ClassInfo) => [c.subject, c.year && `Year ${c.year}`, c.room].filter(Boolean).join(" · ");

  const liveLesson = async (name: string) => {
    await openClass(name);
    setView("lesson");
  };

  const randomise = async (name: string) => {
    await openClass(name);
    setPendingRandomise(true);
    setView("seating");
  };

  return (
    <div>
      <div className="view-header">
        <h1>Organik Classroom</h1>
        <div className="spacer" />
        <button className="primary" onClick={() => setShowNew(true)}>
          + New class
        </button>
      </div>

      {active.length === 0 ? (
        <div className="panel muted">
          No classes yet. Create your first class, then add students and design your room from{" "}
          <b>Settings</b>.
        </div>
      ) : (
        <div className="home-grid">
          {active.map((c) => (
            <div key={c.name} className="class-card">
              <div className="class-card-head">
                <h3>{c.name}</h3>
                {meta(c) && <div className="muted">{meta(c)}</div>}
              </div>
              <div className="class-card-actions">
                <button className="primary" onClick={() => void randomise(c.name)}>
                  🎲 Randomise seating
                </button>
                <button onClick={() => void liveLesson(c.name)}>🎓 Live lesson</button>
              </div>
              <button className="class-card-open" onClick={() => void openClass(c.name).then(() => setView("seating"))}>
                Open class →
              </button>
            </div>
          ))}
        </div>
      )}

      {showNew && <NewClassModal onClose={() => setShowNew(false)} onCreate={createClass} />}
    </div>
  );
}
