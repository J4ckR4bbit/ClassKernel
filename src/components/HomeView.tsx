import { CSSProperties, useState } from "react";
import { useApp } from "../store/appStore";
import { ClassInfo } from "../lib/types";
import { today } from "../lib/id";
import { isSeatingLocked, readLessonStart, readSeatedAt } from "../lib/lessonState";
import { PLUGINS, enabledPlugins } from "../plugins/registry";
import NewClassModal from "./NewClassModal";

/**
 * Landing page: every class as a card with the two things a teacher reaches
 * for at the start of a lesson — reroll the seating, or jump into the live
 * lesson. Setup (students, room layout, seating rules) lives under Settings.
 *
 * Below the classes sits Tools: the plugins this teacher has switched on
 * (Settings → Plugins). Class-independent extras live here rather than in the
 * sidebar, which stays about the class in front of you.
 */
export default function HomeView() {
  const { classes, openClass, setView, setPendingRandomise, createClass, userPrefs, openPlugin, requestSeatingUnlock } = useApp();
  // Re-read the per-class locks whenever the open class's lock changes.
  useApp((s) => s.seatingLockedAt);
  const lockedNow = (name: string) => isSeatingLocked(readSeatedAt(name), readLessonStart(name), today());
  const [showNew, setShowNew] = useState(false);
  const active = classes.filter((c) => !c.archived);
  const tools = enabledPlugins(userPrefs.enabledPlugins);

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

  // Seats were already assigned this lesson: the PIN unlocks another go.
  const reseat = async (name: string) => {
    await openClass(name);
    await requestSeatingUnlock();
  };

  return (
    <div>
      <div className="view-header">
        <h1>ClassKernel</h1>
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
            <div
              key={c.name}
              className={`class-card ${c.color ? "coloured" : ""}`}
              style={c.color ? ({ "--class-colour": c.color } as CSSProperties) : undefined}
            >
              <div className="class-card-head">
                <h3>{c.name}</h3>
                {meta(c) && <div className="muted">{meta(c)}</div>}
              </div>
              <div className="class-card-actions">
                {lockedNow(c.name) ? (
                  <button
                    onClick={() => void reseat(c.name)}
                    title="Seats were assigned this lesson — enter your PIN to assign them again"
                  >
                    🔒 Seats assigned
                  </button>
                ) : (
                  <button className="primary" onClick={() => void randomise(c.name)}>
                    🎲 Randomise seating
                  </button>
                )}
                <button onClick={() => void liveLesson(c.name)}>🎓 Live lesson</button>
              </div>
              <button className="class-card-open" onClick={() => void openClass(c.name).then(() => setView("seating"))}>
                Open class →
              </button>
            </div>
          ))}
        </div>
      )}

      {PLUGINS.length > 0 && (
        <>
          <h2 className="section-heading">Tools</h2>
          {tools.length === 0 ? (
            <div className="panel muted">
              Extra tools — the test timer, a clock, a stopwatch, graph makers and more — ship with the app but stay
              switched off. Turn on the ones you want under <b>Settings → Plugins</b> and they appear here.
            </div>
          ) : (
            <div className="home-grid">
              {tools.map((p) => (
                <button key={p.id} className="tool-card" onClick={() => openPlugin(p.id)}>
                  <span className="tool-icon" aria-hidden>
                    {p.icon}
                  </span>
                  <span className="tool-text">
                    <b>{p.name}</b>
                    <span className="muted">{p.tagline}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {showNew && <NewClassModal onClose={() => setShowNew(false)} onCreate={createClass} />}
    </div>
  );
}
