import { CSSProperties, useState } from "react";
import { View, useApp } from "../store/appStore";
import { ClassInfo } from "../lib/types";
import { PLUGINS, enabledPlugins } from "../plugins/registry";
import NewClassModal from "./NewClassModal";
import Icon from "./Icon";

/** Up to two letters for a class's avatar: "7B-Science" → "7B", "Grade 10 Physics" → "G1". */
function initials(name: string): string {
  const words = name.split(/[\s\-_]+/).filter(Boolean);
  const first = words[0] ?? "";
  if (/\d/.test(first) && first.length <= 3) return first.toUpperCase();
  return ((first[0] ?? "") + (words[1]?.[0] ?? first[1] ?? "")).toUpperCase();
}

/**
 * Landing page: every class as a card that opens straight into the pages a
 * teacher reaches for — the live lesson, the seating plan and the marks.
 * Setup (students, room layout, seating rules) lives under Settings.
 *
 * Below the classes sits Tools: the plugins this teacher has switched on
 * (Settings → Tools). Class-independent extras live here and in the
 * expanded navigation drawer, never among the class's own pages.
 */
export default function HomeView() {
  const { classes, currentClass, openClass, setView, createClass, userPrefs, openPlugin } = useApp();
  const [showNew, setShowNew] = useState(false);
  const active = classes.filter((c) => !c.archived);
  const tools = enabledPlugins(userPrefs.enabledPlugins);

  const meta = (c: ClassInfo) => [c.subject, c.year && `Grade ${c.year}`, c.room].filter(Boolean).join(" · ");

  const go = async (name: string, view: View) => {
    await openClass(name);
    setView(view);
  };

  return (
    <div>
      <div className="home-section">
        <h2>Classes</h2>
        <div className="spacer" />
        <button className="tonal" onClick={() => setShowNew(true)}>
          <Icon name="add" size={20} /> New class
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
              className={`class-card ${c.color ? "coloured" : ""} ${c.name === currentClass ? "current" : ""}`}
              style={c.color ? ({ "--class-colour": c.color } as CSSProperties) : undefined}
            >
              <div className="class-card-head">
                <span className="class-card-avatar" aria-hidden>
                  {initials(c.name)}
                </span>
                <div>
                  <h3>{c.name}</h3>
                  {meta(c) && <div className="muted">{meta(c)}</div>}
                </div>
              </div>
              <div className="class-card-actions">
                <button className="primary" onClick={() => void go(c.name, "lesson")}>
                  <Icon name="school" size={18} /> Lesson
                </button>
                <button onClick={() => void go(c.name, "seating")}>
                  <Icon name="event_seat" size={18} /> Seating
                </button>
                <button onClick={() => void go(c.name, "assessments")}>
                  <Icon name="grading" size={18} /> Marks
                </button>
              </div>
              <button className="text small class-card-open" onClick={() => void go(c.name, "notes")}>
                Open class <Icon name="chevron_right" size={18} />
              </button>
            </div>
          ))}
        </div>
      )}

      {PLUGINS.length > 0 && (
        <>
          <div className="home-section">
            <h2>Tools</h2>
          </div>
          {tools.length === 0 ? (
            <div className="panel muted">
              Extra tools — the test timer, a clock, a stopwatch, graph makers, class and student dashboards, parent
              reports and more — ship with the app but stay switched off. Turn on the ones you want under <b>Settings → Tools</b> and they appear here.
            </div>
          ) : (
            <div className="home-grid">
              {tools.map((p) => (
                <button key={p.id} className="tool-card" onClick={() => openPlugin(p.id)}>
                  <span className="tool-icon" aria-hidden>
                    <Icon name={p.icon} size={26} />
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
