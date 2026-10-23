import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { useAppPick } from "../store/appStore";
import { AttendanceStatus, BehaviourCode, SEAT_COUNTS } from "../lib/types";
import { displayStudentName } from "../lib/privacy";
import { groupSeatsByTable } from "../lib/tables";
import { PASTEL_PRESETS, autoTableColour, tableTint } from "../lib/tableColours";
import { enterDock } from "../lib/teachingWindow";
import { seatBadge, useLessonSession } from "../hooks/useLessonSession";
import { useBatchEntry } from "../hooks/useBatchEntry";
import { useDismissOnOutside } from "../hooks/useDismissOnOutside";
import StudentPicker from "./StudentPicker";
import StudentActions from "./StudentActions";
import BatchPanel from "./BatchPanel";
import Elapsed from "./Elapsed";
import TimerMini from "./TimerMini";
import NoiseMini from "./NoiseMini";
import Icon from "./Icon";

const signed = (points: number) => (points > 0 ? `+${points}` : `${points}`);

/**
 * The simplified teaching mode: the seating plan as a narrow list of tables,
 * docked to one edge of the screen (always on top) so slides and annotation
 * keep the rest. Tap a student to record for them, or use Batch entry to
 * record one behaviour for several students with a tap each.
 */
export default function TeachingStrip() {
  const {
    currentClass,
    desks,
    setDesks,
    seating,
    behaviourCodes,
    roomConfig,
    setFocusMode,
    userPrefs,
    setUserPrefs,
  } = useAppPick(
    "currentClass",
    "desks",
    "setDesks",
    "seating",
    "behaviourCodes",
    "roomConfig",
    "setFocusMode",
    "userPrefs",
    "setUserPrefs",
  );
  const planNames = useMemo(() => [...new Set(seating.map((s) => s.planName))].sort(), [seating]);
  const [plan, setPlan] = useState(planNames[0] ?? "Default");
  const activePlan = planNames.includes(plan) ? plan : planNames[0];
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const lesson = useLessonSession();
  const { byId, lessonEvents, pointsToday, pointsVisible, statusOf, outNow, outVisitOf } = lesson;
  const batch = useBatchEntry(lesson.logBatch);

  const planSeats = useMemo(
    () => seating.filter((s) => s.planName === activePlan && s.studentId),
    [seating, activePlan],
  );
  const tables = useMemo(
    () => groupSeatsByTable(desks, planSeats, roomConfig.frontEdge),
    [desks, planSeats, roomConfig.frontEdge],
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
    void enterDock(next, userPrefs.uiScale);
  };
  // A new display size while docked resizes the strip to match.
  const uiScale = userPrefs.uiScale;
  const docked = useRef(false);
  useEffect(() => {
    if (docked.current) void enterDock(side, uiScale);
    docked.current = true;
    // Only a change of size re-docks; flipping sides docks by itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiScale]);

  const closeActions = () => setActionsFor(null);
  // Tapping anywhere off the student's sheet closes it without recording anything.
  const sheetRef = useRef<HTMLDivElement | null>(null);
  useDismissOnOutside(sheetRef, actionsFor !== null, closeActions);
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
            {/* Full screen first and Exit last, with the other two between, so
                a hurried tap for one never lands on the other. */}
            <div className="strip-head-actions">
              <button
                className="icon-only small"
                onClick={() => setFocusMode(true, "room")}
                disabled={busy}
                title="Teach from the full room plan"
                aria-label="Teach from the full room plan"
              >
                <Icon name="fullscreen" size={20} />
              </button>
              <button
                className={`icon-only small ${colouring ? "primary" : ""}`}
                onClick={() => setColouring((c) => !c)}
                disabled={batch.active}
                aria-pressed={colouring}
                title={colouring ? "Done colouring tables" : "Colour the tables"}
                aria-label="Colour the tables"
              >
                <Icon name="palette" size={20} />
              </button>
              <button
                className="icon-only small"
                onClick={flipSide}
                title={`Dock to the ${side === "left" ? "right" : "left"} edge of the screen`}
                aria-label={`Dock to the ${side === "left" ? "right" : "left"} edge`}
              >
                <Icon name={side === "left" ? "dock_to_right" : "dock_to_left"} size={20} />
              </button>
              <button
                className="icon-only small strip-exit"
                onClick={() => setFocusMode(false)}
                disabled={batch.active}
                title="Exit teaching mode (Esc)"
                aria-label="Exit teaching mode"
              >
                <Icon name="close" size={20} />
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

        {/* Who's out, at the top, so a trip ends with one tap whoever's row is out of sight. */}
        {outNow.length > 0 && !batch.active && (
          <div className="strip-out no-print" role="group" aria-label="Out at the bathroom">
            {outNow.map((v) => {
              const s = byId.get(v.studentId);
              return (
                <button
                  key={`${v.studentId}-${v.start}`}
                  className="bathroom-chip"
                  title="Tap when the student is back"
                  onClick={() => lesson.toggleBathroom(v.studentId)}
                >
                  <Icon name="wc" size={16} />
                  {s ? displayStudentName(s, userPrefs.seatNameStyle) : v.studentId} · <Elapsed visit={v} />
                </button>
              );
            })}
          </div>
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
                    const badge = seatBadge(status, !!outVisitOf(id));
                    const pts = pointsToday.get(id) ?? 0;
                    return (
                      <button
                        key={id}
                        className={`strip-student ${selected ? "selected" : ""} ${status === "A" ? "absent" : ""}`}
                        onClick={() => onRowTap(id)}
                        aria-pressed={batch.active ? selected : undefined}
                      >
                        <span className="strip-check" aria-hidden>
                          {batch.active ? selected ? <Icon name="check" size={16} /> : "" : "•"}
                        </span>
                        <span className="strip-name">{displayStudentName(s, userPrefs.seatNameStyle)}</span>
                        {badge &&
                          (badge.icon ? (
                            <span className={`strip-badge ${badge.tone}`} title={badge.label}>
                              <Icon name={badge.icon} size={16} label={badge.label} />
                            </span>
                          ) : (
                            <span className={`strip-badge ${badge.tone}`} title={badge.label} aria-label={badge.label}>
                              {badge.text}
                            </span>
                          ))}
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

        <NoiseMini inline />
        <TimerMini inline />
        {!batch.active && (
          <footer className="strip-foot">
            <button className="primary" onClick={() => { closeActions(); batch.start(); }} disabled={busy}>
              <Icon name="checklist" size={20} /> Batch entry
            </button>
            <button onClick={() => setPickerOpen(true)} disabled={busy}>
              <Icon name="person_raised_hand" size={20} /> Pick a student
            </button>
            {/* Styled as on the room plan, so the two teaching modes read the same. */}
            {lesson.running ? (
              <button
                className="lesson-btn danger"
                onClick={() => void lesson.endLesson(planSeats).then((ok) => ok && closeActions())}
                disabled={busy}
              >
                <Icon name="stop_circle" size={20} /> End lesson
              </button>
            ) : (
              <button className="lesson-btn start" onClick={() => void lesson.startLesson()} disabled={busy}>
                <Icon name="play_arrow" size={20} /> Start lesson
              </button>
            )}
          </footer>
        )}

        {actionStudent && !batch.active && (
          <div ref={sheetRef} className="strip-sheet behaviour-popover">
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
