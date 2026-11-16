import { CSSProperties, useState } from "react";
import { View, useAppPick } from "../store/appStore";
import { ClassInfo } from "../lib/types";
import { gradeLabel } from "../lib/format";
import { enabledPlugins } from "../plugins/registry";
import { dismissScienceNotice, movedToolNames, openScience, scienceInOwnWindow, scienceNoticeDismissed } from "../lib/science";
import NewClassModal from "./NewClassModal";
import Icon from "@classkernel/ui/Icon";

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
 * expanded navigation drawer, never among the class's own pages. The last
 * card opens ClassKernel Science, the science tools: a window of its own in
 * the desktop app, the website in the browser demo.
 */
export default function HomeView() {
  const { classes, currentClass, openClass, setView, createClass, userPrefs, openPlugin } = useAppPick(
    "classes",
    "currentClass",
    "openClass",
    "setView",
    "createClass",
    "userPrefs",
    "openPlugin",
  );
  const [showNew, setShowNew] = useState(false);
  const [noticeDismissed, setNoticeDismissed] = useState(scienceNoticeDismissed);
  const active = classes.filter((c) => !c.archived);
  const tools = enabledPlugins(userPrefs.enabledPlugins);
  // Science tools this teacher had switched on before they moved to the website.
  const moved = noticeDismissed ? [] : movedToolNames(userPrefs.enabledPlugins);

  const meta = (c: ClassInfo) => [c.subject, c.year && gradeLabel(c.year), c.room].filter(Boolean).join(" · ");

  const go = async (name: string, view: View) => {
    // The open class is already in memory; only a different one is read from disk.
    if (name !== currentClass) await openClass(name);
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
                <button onClick={() => void go(c.name, "seating")}>
                  <Icon name="event_seat" size={18} /> Seating
                </button>
                <button onClick={() => void go(c.name, "assessments")}>
                  <Icon name="grading" size={18} /> Marks
                </button>
                <button className="primary class-card-lesson" onClick={() => void go(c.name, "lesson")}>
                  <Icon name="school" size={18} /> Lesson
                </button>
              </div>
              <button className="text small class-card-open" onClick={() => void go(c.name, "classInfo")}>
                Open class <Icon name="chevron_right" size={18} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="home-section">
        <h2>Tools</h2>
      </div>
      {moved.length > 0 && (
        <div className="panel science-moved" role="status">
          <p className="lead">
            <b>{listNames(moved)}</b> {moved.length === 1 ? "has" : "have"} moved to <b>ClassKernel Science</b>, with all
            the science tools.{" "}
            {scienceInOwnWindow()
              ? "It opens in a window of its own, from the last card under Tools."
              : "It's a website: open it from the last card under Tools. It needs the internet."}
          </p>
          <div className="row">
            <button className="primary" onClick={() => openScience()}>
              <Icon name="open_in_new" size={18} /> Open ClassKernel Science
            </button>
            <button
              className="text"
              onClick={() => {
                dismissScienceNotice();
                setNoticeDismissed(true);
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}
      {tools.length === 0 && (
        <div className="panel muted">
          Extra tools — the test timer, a clock, a stopwatch, a noise meter, class and student dashboards and parent
          reports — ship with the app but stay switched off. Turn on the ones you want under <b>Settings → Tools</b> and they appear here.
        </div>
      )}
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
        <ScienceCard />
      </div>

      {showNew && <NewClassModal onClose={() => setShowNew(false)} onCreate={createClass} />}
    </div>
  );
}

/** "A", "A and B", "A, B and C". */
function listNames(names: string[]): string {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Opens ClassKernel Science, the science tools, in its own window (or the website, in the browser demo). */
export function ScienceCard() {
  return (
    <button className="tool-card science-card" onClick={() => openScience()}>
      <span className="tool-icon" aria-hidden>
        <Icon name="science" size={26} />
      </span>
      <span className="tool-text">
        <b>
          ClassKernel Science <Icon name="open_in_new" size={16} />
        </b>
        <span className="muted">
          Chemistry reference, titration, galvanic cell, graph plotters and graph paper.{" "}
          {scienceInOwnWindow() ? "Opens in its own window." : "Opens in your browser."}
        </span>
      </span>
    </button>
  );
}
