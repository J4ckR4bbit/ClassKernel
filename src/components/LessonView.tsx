import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../store/appStore";
import { AttendanceStatus, BehaviourCode } from "../lib/types";
import { formatDuration, visitSeconds } from "../lib/stats";
import { displayStudentName, seatSurname } from "../lib/privacy";
import { useSeatingShuffle } from "../hooks/useSeatingShuffle";
import { useLessonSession } from "../hooks/useLessonSession";
import { useBatchEntry } from "../hooks/useBatchEntry";
import RoomCanvas, { ROOM_H, ROOM_W } from "./RoomCanvas";
import StudentPicker from "./StudentPicker";
import StudentActions from "./StudentActions";
import BatchPanel from "./BatchPanel";

interface Popover {
  studentId: string;
  x: number;
  y: number;
}

/**
 * The "live lesson" screen: the seating plan is the interface. Tap a seat to
 * log behaviour or take attendance for that student; running points for
 * today's lesson show under each name. Batch entry turns seat taps into a
 * selection instead, so one behaviour can be saved for many students at once.
 */
export default function LessonView() {
  const { currentClass, desks, seating, behaviourCodes, setView, roomConfig, focusMode, setFocusMode, userPrefs } = useApp();
  const planNames = useMemo(() => [...new Set(seating.map((s) => s.planName))].sort(), [seating]);
  const [plan, setPlan] = useState(planNames[0] ?? "Default");
  const activePlan = planNames.includes(plan) ? plan : planNames[0];
  const [popover, setPopover] = useState<Popover | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Reroll the seating in place, with the same animation as the seating plan.
  // Once per lesson: afterwards the button asks for the reseat PIN.
  const { shuffleFrame, isShuffling, randomise, locked, requestUnlock } = useSeatingShuffle();
  const lesson = useLessonSession();
  const { byId, lessonEvents, pointsToday, pointsVisible, statusOf, outNow, outVisitOf } = lesson;
  const batch = useBatchEntry(lesson.logBatch);

  const planSeats = seating.filter((s) => s.planName === activePlan && s.studentId);
  // While rerolling, draw the live shuffle frame instead of the saved seats.
  const shownSeats = shuffleFrame ?? planSeats;

  // In teaching mode the lesson buttons sit on whichever edge Settings says,
  // so they land under the hand of whoever is standing at the board.
  const shellClass = focusMode ? `focus-layout bar-${userPrefs.lessonBarSide}` : "";
  const sideBar = focusMode && (userPrefs.lessonBarSide === "left" || userPrefs.lessonBarSide === "right");
  // Everything else waits while a batch is being picked.
  const busy = isShuffling || batch.active;

  const endLesson = async () => {
    if (await lesson.endLesson(planSeats)) setPopover(null);
  };
  const toggleBathroom = (studentId: string) => {
    lesson.toggleBathroom(studentId);
    setPopover(null);
  };
  const logBehaviour = (studentId: string, c: BehaviourCode) => {
    lesson.logBehaviour(studentId, c);
    setPopover(null);
  };
  const markAttendance = (studentId: string, status: AttendanceStatus) => {
    lesson.markAttendance(studentId, status);
    setPopover(null);
  };
  const startBatch = () => {
    setPopover(null);
    batch.start();
  };

  const popStudent = popover ? byId.get(popover.studentId) : undefined;

  // Always render in scaled (viewBox) mode so the room fills the pane on any
  // screen size — with no crop set, the whole room is the view.
  const effectiveCrop = roomConfig.crop ?? { x: 0, y: 0, w: ROOM_W, h: ROOM_H };

  // Clamp the popover inside the canvas container once its size is known.
  const canvasBoxRef = useRef<HTMLDivElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const [popPos, setPopPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!popover || !canvasBoxRef.current || !popRef.current) {
      setPopPos(null);
      return;
    }
    // offsetWidth/Height are layout pixels, matching the CSS left/top we set
    // (getBoundingClientRect would be scaled by the app zoom).
    const wrap = canvasBoxRef.current;
    const pop = popRef.current;
    setPopPos({
      left: Math.max(4, Math.min(popover.x + 24, wrap.offsetWidth - pop.offsetWidth - 4)),
      top: Math.max(4, Math.min(popover.y - 40, wrap.offsetHeight - pop.offsetHeight - 4)),
    });
  }, [popover]);

  if (desks.length === 0 || planSeats.length === 0) {
    return (
      <div className={shellClass}>
        {focusMode ? (
          <div className="focus-bar">
            <button onClick={() => setFocusMode(false)}>✕ Exit teaching mode</button>
            <span className="muted">Set up a room layout and seating plan to teach from.</span>
          </div>
        ) : (
          <div className="view-header">
            <h1>{currentClass} — Live lesson</h1>
          </div>
        )}
        <div className="panel">
          You need a room layout and a seating plan first.{" "}
          <button className="small" onClick={() => setView(desks.length === 0 ? "layout" : "seating")}>
            {desks.length === 0 ? "Design your room →" : "Create a seating plan →"}
          </button>
        </div>
      </div>
    );
  }

  const planSelect = planNames.length > 1 && (
    <select value={activePlan} onChange={(e) => setPlan(e.target.value)} disabled={batch.active}>
      {planNames.map((n) => (
        <option key={n}>{n}</option>
      ))}
    </select>
  );
  const pickButton = (
    <button onClick={() => setPickerOpen(true)} disabled={busy} title="Choose a random student">
      🙋 Pick a student
    </button>
  );
  const batchButton = (
    <button onClick={startBatch} disabled={busy} title="Record one behaviour for several students at once">
      ☑ Batch entry
    </button>
  );
  const seatButton = locked ? (
    <button onClick={requestUnlock} disabled={busy} title="Seats were assigned this lesson — enter your PIN to assign them again">
      🔒 Reseat…
    </button>
  ) : (
    <button onClick={() => randomise(activePlan)} disabled={busy} title="Reshuffle the seating using your saved rules">
      🎲 {isShuffling ? "Randomising…" : "Randomise"}
    </button>
  );
  const endButton = (
    <button className="danger" onClick={() => void endLesson()} disabled={busy}>
      ⏹ End lesson
    </button>
  );
  const batchPanel = <BatchPanel entry={batch} behaviourCodes={behaviourCodes} layout={sideBar ? "strip" : "bar"} />;

  return (
    <div className={shellClass}>
      {focusMode ? (
        <div className="focus-bar">
          <button onClick={() => setFocusMode(false)} title="Back to the full app (or press Esc)" disabled={batch.active}>
            ✕ Exit teaching mode
          </button>
          <button onClick={() => setFocusMode(true, "strip")} disabled={busy} title="Dock a narrow list of tables to the screen edge">
            ▥ Side panel
          </button>
          {planSelect}
          <div className="spacer" />
          <span className="muted">
            {lessonEvents.length} event{lessonEvents.length === 1 ? "" : "s"} this lesson
          </span>
          {sideBar && batchPanel}
          {batchButton}
          {pickButton}
          {seatButton}
          {endButton}
        </div>
      ) : (
        <div className="view-header">
          <h1>{currentClass} — Live lesson</h1>
          {planSelect}
          <div className="spacer" />
          <span className="muted">
            {lessonEvents.length} event{lessonEvents.length === 1 ? "" : "s"} this lesson · tap a seat to record
            behaviour or attendance
          </span>
          {batchButton}
          {pickButton}
          {seatButton}
          <button onClick={() => setFocusMode(true)} disabled={busy} title="Distraction-free view for teaching, beside your notes">
            ⛶ Teaching mode
          </button>
          <button
            onClick={() => setFocusMode(true, userPrefs.teachingStyle === "strip" ? "room" : "strip")}
            disabled={busy}
            title={
              userPrefs.teachingStyle === "strip"
                ? "Teach from the full-screen room plan instead"
                : "Dock a narrow list of tables to the screen edge, beside your slides"
            }
          >
            {userPrefs.teachingStyle === "strip" ? "⛶ Room plan" : "▥ Side panel"}
          </button>
          {endButton}
        </div>
      )}

      {!sideBar && batchPanel}

      {outNow.length > 0 && (
        <div className="bathroom-bar no-print">
          <span className="muted">🚻 Out now:</span>
          {outNow.map((v) => {
            const s = byId.get(v.studentId);
            return (
              <button
                key={`${v.studentId}-${v.start}`}
                className="bathroom-chip"
                title="Tap when the student is back"
                onClick={() => toggleBathroom(v.studentId)}
              >
                {s ? displayStudentName(s, userPrefs.seatNameStyle) : v.studentId} · {formatDuration(visitSeconds(v))} ✓
              </button>
            );
          })}
        </div>
      )}

      <div
        ref={canvasBoxRef}
        className={`seating-canvas ${focusMode ? "focus-canvas-wrap" : ""} ${isShuffling ? "shuffling" : ""} ${batch.active ? "batching" : ""}`}
        style={{ position: "relative" }}
      >
        {isShuffling && <div className="shuffle-overlay no-print">🎲 Randomising seats…</div>}
        <RoomCanvas
          desks={desks}
          frontEdge={roomConfig.frontEdge}
          crop={effectiveCrop}
          seatFontScale={roomConfig.seatFontScale}
          deskFontScale={roomConfig.deskFontScale}
          labelFontScale={roomConfig.labelFontScale}
          seatContent={(deskId, seatIndex) => {
            const occ = shownSeats.find((s) => s.deskId === deskId && s.seatIndex === seatIndex);
            const s = occ ? byId.get(occ.studentId) : undefined;
            const status = s ? statusOf(s.id) : undefined;
            return {
              label: s ? displayStudentName(s, userPrefs.seatNameStyle) : "",
              firstName: s?.firstName,
              lastName: s ? seatSurname(s, userPrefs.seatNameStyle) : undefined,
              badge: !isShuffling && s && outVisitOf(s.id) ? "🚻" : status === "A" && !isShuffling ? "✗" : undefined,
              occupied: !!s,
              points: s && !isShuffling && pointsVisible ? pointsToday.get(s.id) ?? 0 : null,
              selected: !!s && batch.isSelected(s.id),
            };
          }}
          onSeatClick={(deskId, seatIndex, x, y) => {
            if (isShuffling) return;
            const occ = planSeats.find((s) => s.deskId === deskId && s.seatIndex === seatIndex);
            if (!occ) return;
            // In batch entry a tap selects/deselects; nothing is saved until Save.
            if (batch.active) {
              if (batch.batch?.code) batch.toggle(occ.studentId);
            } else setPopover({ studentId: occ.studentId, x, y });
          }}
        />

        {popover && popStudent && (
          <div
            ref={popRef}
            className="behaviour-popover"
            style={{
              left: popPos?.left ?? popover.x + 24,
              top: popPos?.top ?? Math.max(popover.y - 40, 4),
              visibility: popPos ? "visible" : "hidden",
            }}
          >
            <StudentActions
              student={popStudent}
              status={statusOf(popStudent.id)}
              outVisit={outVisitOf(popStudent.id)}
              onAttendance={(status) => markAttendance(popStudent.id, status)}
              onBathroom={() => toggleBathroom(popStudent.id)}
              onBehaviour={(c) => logBehaviour(popStudent.id, c)}
              onClose={() => setPopover(null)}
            />
          </div>
        )}
      </div>
      {pickerOpen && (
        <StudentPicker
          onClose={() => setPickerOpen(false)}
          lessonEvents={lessonEvents}
          showTally={pointsVisible}
          onLogBehaviour={logBehaviour}
        />
      )}
    </div>
  );
}
