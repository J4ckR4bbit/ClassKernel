import { useMemo, useState } from "react";
import { useApp } from "../store/appStore";
import { AttendanceStatus, BehaviourCode } from "../lib/types";
import { displayStudentName } from "../lib/privacy";
import { groupSeatsByTable } from "../lib/tables";
import { enterDock } from "../lib/teachingWindow";
import { useSeatingShuffle } from "../hooks/useSeatingShuffle";
import { useLessonSession } from "../hooks/useLessonSession";
import { useBatchEntry } from "../hooks/useBatchEntry";
import StudentPicker from "./StudentPicker";
import StudentActions from "./StudentActions";
import BatchPanel from "./BatchPanel";

const signed = (points: number) => (points > 0 ? `+${points}` : `${points}`);

/**
 * The simplified teaching mode: the seating plan as a narrow list of tables,
 * docked to one edge of the screen (always on top) so slides and annotation
 * keep the rest. Tap a student to record for them, or use Batch entry to
 * record one behaviour for several students with a tap each.
 */
export default function TeachingStrip() {
  const { currentClass, desks, seating, behaviourCodes, roomConfig, setFocusMode, userPrefs, setUserPrefs } = useApp();
  const planNames = useMemo(() => [...new Set(seating.map((s) => s.planName))].sort(), [seating]);
  const [plan, setPlan] = useState(planNames[0] ?? "Default");
  const activePlan = planNames.includes(plan) ? plan : planNames[0];
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { isShuffling, randomise, locked, requestUnlock } = useSeatingShuffle();
  const lesson = useLessonSession();
  const { byId, lessonEvents, pointsToday, pointsVisible, statusOf, outVisitOf } = lesson;
  const batch = useBatchEntry(lesson.logBatch);

  const planSeats = seating.filter((s) => s.planName === activePlan && s.studentId);
  const tables = useMemo(
    () => groupSeatsByTable(desks, planSeats, roomConfig.frontEdge),
    // planSeats is rebuilt every render; seating is what it derives from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [desks, seating, activePlan, roomConfig.frontEdge],
  );
  const busy = isShuffling || batch.active;
  const side = userPrefs.dockSide;

  const flipSide = () => {
    const next = side === "left" ? "right" : "left";
    void setUserPrefs({ ...userPrefs, dockSide: next });
    void enterDock(next);
  };

  const closeActions = () => setActionsFor(null);
  const onRowTap = (studentId: string) => {
    if (batch.active) {
      if (batch.batch?.code) batch.toggle(studentId);
    } else setActionsFor(studentId);
  };
  const logBehaviour = (studentId: string, c: BehaviourCode) => {
    lesson.logBehaviour(studentId, c);
    closeActions();
  };
  const markAttendance = (studentId: string, status: AttendanceStatus) => {
    lesson.markAttendance(studentId, status);
    closeActions();
  };
  const toggleBathroom = (studentId: string) => {
    lesson.toggleBathroom(studentId);
    closeActions();
  };

  const actionStudent = actionsFor ? byId.get(actionsFor) : undefined;
  const choosingItem = batch.active && !batch.batch?.code;

  return (
    <div className={`strip-shell dock-${side}`}>
      <aside className="strip">
        <header className="strip-head">
          <div className="strip-title">
            <b>{currentClass}</b>
            <span className="muted">
              {lessonEvents.length} event{lessonEvents.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="strip-head-actions">
            <button
              className="small"
              onClick={flipSide}
              title={`Dock to the ${side === "left" ? "right" : "left"} edge of the screen`}
            >
              {side === "left" ? "⇥" : "⇤"}
            </button>
            <button className="small" onClick={() => setFocusMode(true, "room")} disabled={busy} title="Teach from the full room plan">
              ⛶
            </button>
            <button className="small" onClick={() => setFocusMode(false)} disabled={batch.active} title="Exit teaching mode (Esc)">
              ✕
            </button>
          </div>
        </header>
        {planNames.length > 1 && (
          <select className="strip-plan" value={activePlan} onChange={(e) => setPlan(e.target.value)} disabled={batch.active}>
            {planNames.map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        )}

        <BatchPanel entry={batch} behaviourCodes={behaviourCodes} layout="strip" />

        {!choosingItem && (
          <div className={`strip-tables ${batch.active ? "batching" : ""}`}>
            {tables.length === 0 && (
              <p className="muted">No one is seated in this plan yet. Set up the seating plan, then come back.</p>
            )}
            {tables.map((t) => (
              <section key={t.deskId} className="strip-table">
                <h5>{t.label}</h5>
                {t.studentIds.map((id) => {
                  const s = byId.get(id);
                  if (!s) return null;
                  const selected = batch.isSelected(id);
                  const status = statusOf(id);
                  const pts = pointsToday.get(id) ?? 0;
                  return (
                    <button
                      key={id}
                      className={`strip-student ${selected ? "selected" : ""} ${status === "A" ? "absent" : ""}`}
                      onClick={() => onRowTap(id)}
                      aria-pressed={batch.active ? selected : undefined}
                    >
                      <span className="strip-check" aria-hidden>
                        {batch.active ? (selected ? "✓" : "") : "•"}
                      </span>
                      <span className="strip-name">{displayStudentName(s, userPrefs.seatNameStyle)}</span>
                      {outVisitOf(id) && <span title="Out at the bathroom">🚻</span>}
                      {status === "A" && (
                        <span className="strip-absent" title="Absent">
                          ✗
                        </span>
                      )}
                      {pointsVisible && pts !== 0 && (
                        <span className={`strip-points ${pts > 0 ? "pos" : "neg"}`}>{signed(pts)}</span>
                      )}
                    </button>
                  );
                })}
              </section>
            ))}
          </div>
        )}

        {!batch.active && (
          <footer className="strip-foot">
            <button className="primary" onClick={() => { closeActions(); batch.start(); }} disabled={busy}>
              ☑ Batch entry
            </button>
            <button onClick={() => setPickerOpen(true)} disabled={busy}>
              🙋 Pick a student
            </button>
            {locked ? (
              <button onClick={requestUnlock} disabled={busy} title="Seats were assigned this lesson — enter your PIN to assign them again">
                🔒 Reseat…
              </button>
            ) : (
              <button onClick={() => randomise(activePlan)} disabled={busy || planSeats.length === 0}>
                🎲 {isShuffling ? "Randomising…" : "Randomise"}
              </button>
            )}
            <button className="danger" onClick={() => void lesson.endLesson(planSeats).then((ok) => ok && closeActions())} disabled={busy}>
              ⏹ End lesson
            </button>
          </footer>
        )}

        {actionStudent && !batch.active && (
          <div className="strip-sheet behaviour-popover">
            <StudentActions
              student={actionStudent}
              status={statusOf(actionStudent.id)}
              outVisit={outVisitOf(actionStudent.id)}
              onAttendance={(status) => markAttendance(actionStudent.id, status)}
              onBathroom={() => toggleBathroom(actionStudent.id)}
              onBehaviour={(c) => logBehaviour(actionStudent.id, c)}
              onClose={closeActions}
            />
          </div>
        )}
      </aside>
      {/* In the desktop app the window is only as wide as the strip; in a
          browser this is the space left for teaching. */}
      <div className="strip-rest" />
      {pickerOpen && (
        <StudentPicker
          onClose={() => setPickerOpen(false)}
          lessonEvents={lessonEvents}
          showTally={pointsVisible}
          onLogBehaviour={(id, c) => lesson.logBehaviour(id, c)}
        />
      )}
    </div>
  );
}
