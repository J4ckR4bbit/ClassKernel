import { CSSProperties, useEffect, useState } from "react";
import { useApp } from "./store/appStore";
import Onboarding from "./components/Onboarding";
import NavRail from "./components/NavRail";
import TopAppBar from "./components/TopAppBar";
import Icon from "./components/Icon";
import HomeView from "./components/HomeView";
import RosterView from "./components/RosterView";
import AttendanceView from "./components/AttendanceView";
import LayoutDesigner from "./components/LayoutDesigner";
import SeatingView from "./components/SeatingView";
import LessonView from "./components/LessonView";
import TeachingStrip from "./components/TeachingStrip";
import BehaviourLogView from "./components/BehaviourLogView";
import AssessmentsView from "./components/AssessmentsView";
import ClassNotesView from "./components/ClassNotesView";
import PluginView from "./components/PluginView";
import SettingsView from "./components/SettingsView";
import AppDialog from "./components/AppDialog";
import TimerMini from "./components/TimerMini";
import NoiseMini from "./components/NoiseMini";

/** Toast + dialog + save-error UI shared by both shells. */
function Overlays() {
  const { toast, saveError, retrySave } = useApp();
  return (
    <>
      {saveError && (
        <div className="save-error-banner">
          Couldn't save {saveError.label} to disk — your changes are only in memory.
          <button onClick={() => void retrySave()}>Try again</button>
        </div>
      )}
      {toast && (
        <div className="toast">
          {toast.message}
          {toast.actionLabel && (
            <button
              className="toast-action"
              onClick={() => {
                toast.onAction?.();
                useApp.setState({ toast: null });
              }}
            >
              {toast.actionLabel}
            </button>
          )}
        </div>
      )}
      {/* The running tools' pop-ups, stacked in the bottom-right corner. */}
      <div className="mini-stack no-print">
        <NoiseMini />
        <TimerMini />
      </div>
      <AppDialog />
    </>
  );
}

const NAV_KEY = "classkernel.navExpanded";

function readNavExpanded(): boolean {
  try {
    return localStorage.getItem(NAV_KEY) === "1";
  } catch {
    return false;
  }
}

export default function App() {
  const { booted, dataDir, currentClass, classes, view, demoMode, focusMode, focusStyle, setFocusMode, boot, userPrefs } = useApp();
  // The open class's colour underlines the top app bar on its own pages (not
  // Home, Settings or the plugins, which aren't about one class).
  const classPage = view !== "home" && view !== "settings" && view !== "plugin";
  const classColour = classPage ? classes.find((c) => c.name === currentClass)?.color ?? "" : "";

  useEffect(() => {
    void boot();
  }, [boot]);

  // The rail expands into a drawer with full labels and the teacher's tools;
  // remembered on this computer, since it's about this screen, not the data.
  const [navExpanded, setNavExpanded] = useState(readNavExpanded);
  const toggleNav = () => {
    const next = !navExpanded;
    setNavExpanded(next);
    try {
      localStorage.setItem(NAV_KEY, next ? "1" : "0");
    } catch {
      // Not remembered; still applies for this session.
    }
  };

  // Escape always leaves the distraction-free teaching layout (unless a
  // dialog is open — then it just closes the dialog).
  useEffect(() => {
    if (!focusMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !useApp.getState().dialog) setFocusMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusMode, setFocusMode]);

  // Whole-app display scale for large touch panels. `zoom` scales layout,
  // inline px styles and SVG coherently, which a root font-size change can't
  // do with this all-px stylesheet.
  const scale = userPrefs.uiScale;
  useEffect(() => {
    const root = document.documentElement;
    if (scale && scale !== 1) root.style.setProperty("zoom", String(scale));
    else root.style.removeProperty("zoom");
    return () => {
      root.style.removeProperty("zoom");
    };
  }, [scale]);

  if (!booted) return <div className="boot-screen">Loading…</div>;
  if (!dataDir) return <Onboarding />;

  // Teaching mode: just the live-lesson seating view, no sidebar or chrome, so
  // it can sit beside notes/slides. LessonView renders its own compact bar;
  // the strip is the narrow table list docked to a screen edge.
  if (focusMode && currentClass) {
    return (
      <div className={`focus-shell ${focusStyle === "strip" ? "strip-mode" : ""}`}>
        {focusStyle === "strip" ? <TeachingStrip /> : <LessonView />}
        <Overlays />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <NavRail expanded={navExpanded} onToggle={toggleNav} />
      <div className="app-body" style={classColour ? ({ "--class-colour": classColour } as CSSProperties) : undefined}>
        <TopAppBar />
        <main className="main-pane">
          {demoMode && (
            <div className="demo-banner">
              Demo mode — running in a browser without the desktop backend; data lives in memory only.
            </div>
          )}
          {!currentClass && view !== "settings" && view !== "home" && view !== "plugin" ? (
            <div className="empty-state">
              <Icon name="group" size={48} />
              <h2>No class selected</h2>
              <p>Pick a class from the menu at the top right, or create one there.</p>
            </div>
          ) : (
            <>
              {view === "home" && <HomeView />}
              {view === "roster" && <RosterView />}
              {view === "attendance" && <AttendanceView />}
              {view === "layout" && <LayoutDesigner />}
              {view === "seating" && <SeatingView />}
              {view === "lesson" && <LessonView />}
              {view === "behaviourLog" && <BehaviourLogView />}
              {view === "assessments" && <AssessmentsView />}
              {view === "notes" && <ClassNotesView />}
              {view === "plugin" && <PluginView />}
              {view === "settings" && <SettingsView />}
            </>
          )}
        </main>
      </div>
      <Overlays />
    </div>
  );
}
