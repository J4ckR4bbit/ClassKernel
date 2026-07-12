import { useEffect } from "react";
import { useApp } from "./store/appStore";
import Onboarding from "./components/Onboarding";
import Sidebar from "./components/Sidebar";
import RosterView from "./components/RosterView";
import AttendanceView from "./components/AttendanceView";
import LayoutDesigner from "./components/LayoutDesigner";
import SeatingView from "./components/SeatingView";
import LessonView from "./components/LessonView";
import BehaviourLogView from "./components/BehaviourLogView";
import AssessmentsView from "./components/AssessmentsView";
import DashboardView from "./components/DashboardView";
import ClassNotesView from "./components/ClassNotesView";
import SettingsView from "./components/SettingsView";

export default function App() {
  const { booted, dataDir, currentClass, view, toast, demoMode, focusMode, setFocusMode, boot } = useApp();

  useEffect(() => {
    void boot();
  }, [boot]);

  // Escape always leaves the distraction-free teaching layout.
  useEffect(() => {
    if (!focusMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocusMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusMode, setFocusMode]);

  if (!booted) return <div className="boot-screen">Loading…</div>;
  if (!dataDir) return <Onboarding />;

  // Teaching mode: just the live-lesson seating view, no sidebar or chrome, so
  // it can sit beside notes/slides. LessonView renders its own compact bar.
  if (focusMode && currentClass) {
    return (
      <div className="focus-shell">
        <LessonView />
        {toast && <div className="toast">{toast}</div>}
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
        {!currentClass && view !== "settings" ? (
          <div className="empty-state">
            <h2>No class selected</h2>
            <p>Create a class from the sidebar to get started.</p>
          </div>
        ) : (
          <>
            {view === "roster" && <RosterView />}
            {view === "attendance" && <AttendanceView />}
            {view === "layout" && <LayoutDesigner />}
            {view === "seating" && <SeatingView />}
            {view === "lesson" && <LessonView />}
            {view === "behaviourLog" && <BehaviourLogView />}
            {view === "assessments" && <AssessmentsView />}
            {view === "dashboard" && <DashboardView />}
            {view === "notes" && <ClassNotesView />}
            {view === "settings" && <SettingsView />}
          </>
        )}
      </main>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
