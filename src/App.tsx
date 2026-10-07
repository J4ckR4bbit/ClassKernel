import { useEffect } from "react";
import { useApp } from "./store/appStore";
import Onboarding from "./components/Onboarding";
import Sidebar from "./components/Sidebar";
import HomeView from "./components/HomeView";
import RosterView from "./components/RosterView";
import AttendanceView from "./components/AttendanceView";
import LayoutDesigner from "./components/LayoutDesigner";
import SeatingView from "./components/SeatingView";
import LessonView from "./components/LessonView";
import TeachingStrip from "./components/TeachingStrip";
import BehaviourLogView from "./components/BehaviourLogView";
import AssessmentsView from "./components/AssessmentsView";
import DashboardView from "./components/DashboardView";
import ClassNotesView from "./components/ClassNotesView";
import TimerView from "./components/TimerView";
import PluginView from "./components/PluginView";
import SettingsView from "./components/SettingsView";
import AppDialog from "./components/AppDialog";
import TimerMini from "./components/TimerMini";

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
      <TimerMini />
      <AppDialog />
    </>
  );
}

export default function App() {
  const { booted, dataDir, currentClass, view, demoMode, focusMode, focusStyle, setFocusMode, boot, userPrefs } = useApp();

  useEffect(() => {
    void boot();
  }, [boot]);

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
      <Sidebar />
      <main className="main-pane">
        {demoMode && (
          <div className="demo-banner">
            Demo mode — running in a browser without the desktop backend; data lives in memory only.
          </div>
        )}
        {!currentClass && view !== "settings" && view !== "home" && view !== "timer" && view !== "plugin" ? (
          <div className="empty-state">
            <h2>No class selected</h2>
            <p>Create a class from the sidebar to get started.</p>
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
            {view === "dashboard" && <DashboardView />}
            {view === "notes" && <ClassNotesView />}
            {view === "timer" && <TimerView />}
            {view === "plugin" && <PluginView />}
            {view === "settings" && <SettingsView />}
          </>
        )}
      </main>
      <Overlays />
    </div>
  );
}
