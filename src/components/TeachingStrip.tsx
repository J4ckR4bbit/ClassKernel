import { CSSProperties, useMemo, useState } from "react";
import { useApp } from "../store/appStore";
import { AttendanceStatus, BehaviourCode, SEAT_COUNTS } from "../lib/types";
import { displayStudentName } from "../lib/privacy";
import { groupSeatsByTable } from "../lib/tables";
import { PASTEL_PRESETS, autoTableColour, tableTint } from "../lib/tableColours";
import { enterDock } from "../lib/teachingWindow";
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
  const { currentClass, desks, setDesks, seating, behaviourCodes, roomConfig, setFocusMode, userPrefs, setUserPrefs } = useApp();
  const planNames = useMemo(() => [...new Set(seating.map((s) => s.planName))].sort(), [seating]);
  const [plan, setPlan] = useState(planNames[0] ?? "Default");
  const activePlan = planNames.includes(plan) ? plan : planNames[0];
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
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
  // Seating is assigned from the other screens; the strip is for recording.
  const busy = batch.active;

  // Table colours: each table's own strip colour, or the next pastel in turn.
  // The turn is counted in layout order, so a table keeps its colour from
  // lesson to lesson whoever happens to sit there.
  const [colouring, setColouring] = useState(false);
  const pastelSlot = useMemo(
    () => new Map(desks.filter((d) => SEAT_COUNTS[d.shape] > 0).map((d, i) => [d.id, i])),
    [desks],
  );
  const fillOf = (deskId: string) =>
    desks.find((d) => d.id === deskId)?.stripColor || autoTableColour(pastelSlot.get(deskId) ?? 0);
  const setTableColour = (deskId: string, hex: string) =>
    void setDesks(desks.map((d) => (d.id === deskId ? { ...d, stripColor: hex } : d)));
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
          {/* The class name gets a line to itself so it's never cut short by the buttons. */}
          <b className="strip-class">{currentClass}</b>
          <div className="strip-head-row">
            <span className="muted strip-count">
              {lessonEvents.length} event{lessonEvents.length === 1 ? "" : "s"}
            </span>
            <div className="strip-head-actions">
              <button
                className={`small ${colouring ? "primary" : ""}`}
                onClick={() => setColouring((c) => !c)}
                disabled={batch.active}
                aria-pressed={colouring}
                title={colouring ? "Done colouring tables" : "Colour the tables"}
              >
                🎨
              </button>
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
            {colouring && (
              <div className="strip-colour-hint">
                <span>Pick a colour for each table.</span>
                <button className="small primary" onClick={() => setColouring(false)}>
                  Done
                </button>
              </div>
            )}
            {tables.map((t) => {
              const fill = fillOf(t.deskId);
              const tint = tableTint(fill);
              const own = desks.find((d) => d.id === t.deskId)?.stripColor ?? "";
              return (
                <section
                  key={t.deskId}
                  className="strip-table"
                  style={{ "--tbl-bg": tint.bg, "--tbl-accent": tint.accent } as CSSProperties}
                >
                  <h5>
                    <span>{t.label}</span>
                    <span className="strip-table-count">{t.studentIds.length}</span>
                  </h5>
                  {colouring && (
                    <div className="strip-swatches" role="group" aria-label={`Colour for ${t.label}`}>
                      {PASTEL_PRESETS.map((c) => (
                        <button
                          key={c.hex}
                          className={`swatch ${fill === c.hex ? "on" : ""}`}
                          style={{ background: c.hex }}
                          title={c.name}
                          aria-label={`${c.name} for ${t.label}`}
                          onClick={() => setTableColour(t.deskId, c.hex)}
                        />
                      ))}
                      <input
                        type="color"
                        title="Any colour"
                        aria-label={`Custom colour for ${t.label}`}
                        value={fill}
                        onChange={(e) => setTableColour(t.deskId, e.target.value)}
                      />
                      {own && (
                        <button className="small" onClick={() => setTableColour(t.deskId, "")} title="Back to the automatic colour">
                          Auto
                        </button>
                      )}
                    </div>
                  )}
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
              );
            })}
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
